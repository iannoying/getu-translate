import type { LLMProviderConfig } from "@/types/config/provider"
import type { TranslatePromptOptions, TranslatePromptResult } from "@/utils/prompts/translate"
import { generateText } from "ai"
import { extractAISDKErrorMessage } from "@/utils/error/extract-message"
import { getModelById } from "@/utils/providers/model"
import { resolveModelId } from "@/utils/providers/model-id"
import { getProviderOptionsWithOverride } from "@/utils/providers/options"

const THINK_TAG_RE = /<\/think>([\s\S]*)/
const QUOTA_ERROR_STATUSES: Record<number, string> = {
  403: "FORBIDDEN",
  429: "QUOTA_EXCEEDED",
}

export type PromptResolver<TContext = unknown> = (
  targetLang: string,
  input: string,
  options?: TranslatePromptOptions<TContext>,
) => Promise<TranslatePromptResult>

export interface AiTranslateOptions<TContext = unknown> {
  isBatch?: boolean
  context?: TContext
  headers?: Record<string, string | undefined>
}

function readStringProperty(source: Record<string, unknown>, key: string): string | undefined {
  return typeof source[key] === "string" ? source[key] : undefined
}

function parseResponseBody(error: unknown): Record<string, unknown> | null {
  if (typeof error !== "object" || error === null)
    return null

  const responseBody = (error as { responseBody?: unknown }).responseBody
  if (typeof responseBody !== "string" || responseBody.length === 0)
    return null

  try {
    const parsed = JSON.parse(responseBody)
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null
  }
  catch {
    return null
  }
}

function extractAISDKErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null)
    return undefined

  const source = error as Record<string, unknown>
  const directCode = readStringProperty(source, "code")
  if (directCode)
    return directCode

  const data = source.data
  if (typeof data === "object" && data !== null) {
    const dataCode = readStringProperty(data as Record<string, unknown>, "code")
    if (dataCode)
      return dataCode
  }

  const responseBody = parseResponseBody(error)
  const bodyCode = responseBody ? readStringProperty(responseBody, "code") : undefined
  if (bodyCode)
    return bodyCode

  const status = typeof source.statusCode === "number"
    ? source.statusCode
    : typeof source.status === "number" ? source.status : undefined
  return status ? QUOTA_ERROR_STATUSES[status] : undefined
}

function extractAISDKStructuredMessage(error: unknown): string {
  const responseBody = parseResponseBody(error)
  if (responseBody) {
    const errorMessage = readStringProperty(responseBody, "error")
    if (errorMessage)
      return errorMessage
    const message = readStringProperty(responseBody, "message")
    if (message)
      return message
  }

  return extractAISDKErrorMessage(error)
}

function createAISDKError(error: unknown): Error {
  const nextError = new Error(extractAISDKStructuredMessage(error)) as Error & {
    code?: string
    data?: { code: string }
  }
  const code = extractAISDKErrorCode(error)
  if (code) {
    nextError.code = code
    nextError.data = { code }
  }
  return nextError
}

export async function aiTranslate<TContext>(
  text: string,
  targetLangName: string,
  providerConfig: LLMProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: AiTranslateOptions<TContext>,
) {
  const { id: providerId, model: providerModel, provider, providerOptions: userProviderOptions, temperature } = providerConfig
  const modelName = resolveModelId(providerModel)
  const model = await getModelById(providerId, {
    quotaBucket: options?.headers?.["x-getu-quota-bucket"] === "web_text_translate_token_monthly"
      ? "web_text_translate_token_monthly"
      : "ai_translate_monthly",
  })

  const providerOptions = getProviderOptionsWithOverride(modelName ?? "", provider, userProviderOptions)
  const { systemPrompt, prompt } = await promptResolver(targetLangName, text, options)

  try {
    const { text: translatedText } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      temperature,
      providerOptions,
      headers: options?.headers,
      maxRetries: 0, // Disable SDK built-in retries, let RequestQueue/BatchQueue handle it
    })

    const [, finalTranslation = translatedText] = translatedText.match(THINK_TAG_RE) || []

    return finalTranslation
  }
  catch (error) {
    throw createAISDKError(error)
  }
}
