import type { TranslateModelId } from "@getu/definitions"
import { TranslateProviderError } from "./free-providers"

/**
 * Bianxie.ai (OpenAI-compatible) chat-completion model name for each
 * `TranslateModelId`. Diverges from `TranslateModelId` only where bianxie
 * publishes the model under a different name (qwen3.5-plus has no dash).
 *
 * Intentionally a Partial — `coder-claude-4.7-opus` is NOT yet published on
 * bianxie, so we don't route it. The /translate UI surfaces PROVIDER_FAILED
 * for that column until bianxie adds the model. Token-cost coefficients for
 * `gpt-5.4-mini` come from `TRANSLATE_MODEL_BY_ID` (definitions package),
 * decoupled from the contract's `AI_MODEL_COEFFICIENTS` (extension proxy).
 */
export const TRANSLATE_MODEL_TO_BIANXIE: Partial<Record<TranslateModelId, string>> = {
  "deepseek-v4-pro": "deepseek-v4-pro",
  "qwen-3.5-plus": "qwen3.5-plus",
  "glm-5.1": "glm-5.1",
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt-5.5": "gpt-5.5",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
}

export type BianxieLlmEnv = {
  BIANXIE_API_KEY: string
  BIANXIE_BASE_URL: string
}

export type BianxieLlmResult = {
  text: string
  tokens: { input: number; output: number }
}

/**
 * Translate one chunk via bianxie.ai. Non-streaming (per-chunk pipeline
 * doesn't need streaming). Throws `TranslateProviderError` on any failure
 * so the caller's existing PROVIDER_FAILED wrapping path triggers.
 */
export async function bianxieLlmTranslate(
  modelId: TranslateModelId,
  sourceText: string,
  sourceLang: string,
  targetLang: string,
  env: BianxieLlmEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<BianxieLlmResult> {
  const bianxieModel = TRANSLATE_MODEL_TO_BIANXIE[modelId]
  if (!bianxieModel) {
    throw new TranslateProviderError(
      modelId,
      `model '${modelId}' is not yet wired to a provider`,
    )
  }

  const providerId = `bianxie:${modelId}`
  const url = `${env.BIANXIE_BASE_URL}/chat/completions`
  const body = {
    model: bianxieModel,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          `You are a professional translator. Translate the user's text from ${sourceLang} to ${targetLang}. ` +
          "Output ONLY the translation, no commentary, no quotes, no labels.",
      },
      { role: "user", content: sourceText },
    ],
  }

  const resp = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.BIANXIE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((cause) => {
    throw new TranslateProviderError(
      providerId,
      `network error: ${(cause as Error).message}`,
    )
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "")
    throw new TranslateProviderError(
      providerId,
      `request failed: ${resp.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
      resp.status,
    )
  }

  let parsed: unknown
  try {
    parsed = await resp.json()
  } catch (cause) {
    throw new TranslateProviderError(
      providerId,
      `invalid JSON: ${(cause as Error).message}`,
    )
  }

  const obj = parsed as {
    choices?: Array<{ message?: { content?: unknown } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const content = obj.choices?.[0]?.message?.content
  if (typeof content !== "string" || content.length === 0) {
    throw new TranslateProviderError(providerId, "missing translation text in response")
  }
  const promptTokens = obj.usage?.prompt_tokens
  const completionTokens = obj.usage?.completion_tokens
  if (typeof promptTokens !== "number" || typeof completionTokens !== "number") {
    throw new TranslateProviderError(providerId, "missing usage.{prompt,completion}_tokens")
  }

  return {
    text: content,
    tokens: { input: promptTokens, output: completionTokens },
  }
}
