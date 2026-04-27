import type { TranslationRequestSnapshot, TranslationResultState, TranslationWorkbenchPlan } from "./types"
import type { Config } from "@/types/config/config"
import type { TranslateProviderConfig } from "@/types/config/provider"
import { sendMessage } from "@/utils/message"
import { orpcClient } from "@/utils/orpc/client"
import {
  buildSidebarClickRequestId,
  buildSidebarTokenRequestId,
  getProviderGate,
  isGetuProProvider,
} from "./provider-gating"

interface RunTranslationWorkbenchRequestInput {
  plan: TranslationWorkbenchPlan
  userId: string | null
  request: TranslationRequestSnapshot
  providers: TranslateProviderConfig[]
  languageLevel: Config["language"]["level"]
}

interface ProviderClassification {
  provider: TranslateProviderConfig
  result: TranslationResultState | null
}

const QUOTA_EXHAUSTION_CODES = new Set(["QUOTA_EXCEEDED", "INSUFFICIENT_QUOTA", "FORBIDDEN"])

function errorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message

  if (error !== null && typeof error === "object") {
    const maybeError = error as { data?: { message?: unknown }, message?: unknown }
    if (typeof maybeError.data?.message === "string")
      return maybeError.data.message
    if (typeof maybeError.message === "string")
      return maybeError.message
  }

  return "translation failed"
}

function isQuotaExhaustionError(error: unknown): boolean {
  if (error === null || typeof error !== "object")
    return false

  const maybeError = error as { data?: { code?: unknown }, code?: unknown }
  const code = maybeError.data?.code ?? maybeError.code
  return typeof code === "string" && QUOTA_EXHAUSTION_CODES.has(code)
}

function failureResult(providerId: string, error: unknown): TranslationResultState {
  return {
    providerId,
    status: isQuotaExhaustionError(error) ? "quota-exhausted" : "error",
    errorMessage: errorMessage(error),
  }
}

export async function runTranslationWorkbenchRequest({
  plan,
  userId,
  request,
  providers,
  languageLevel,
}: RunTranslationWorkbenchRequestInput): Promise<TranslationResultState[]> {
  const classifications: ProviderClassification[] = providers.map((provider) => {
    if (!provider.enabled) {
      return {
        provider,
        result: {
          providerId: provider.id,
          status: "error",
          errorMessage: "Provider is disabled",
        },
      }
    }

    const gate = getProviderGate(provider, plan)
    if (gate === "login-required" || gate === "upgrade-required") {
      return {
        provider,
        result: { providerId: provider.id, status: gate },
      }
    }

    return { provider, result: null }
  })

  const hasRunnableProvider = classifications.some(({ result }) => result === null)

  if (userId !== null && hasRunnableProvider) {
    try {
      await orpcClient.billing.consumeQuota({
        bucket: "web_text_translate_monthly",
        amount: 1,
        request_id: buildSidebarClickRequestId(request.clickId),
      })
    }
    catch (error) {
      return classifications.map(({ provider, result }) => result ?? failureResult(provider.id, error))
    }
  }

  return Promise.all(
    classifications.map(async ({ provider, result }): Promise<TranslationResultState> => {
      if (result !== null)
        return result

      try {
        const headers = isGetuProProvider(provider)
          ? {
              "x-request-id": buildSidebarTokenRequestId(request.clickId, provider.id),
              "x-getu-quota-bucket": "web_text_translate_token_monthly",
            }
          : undefined

        const langConfig = {
          sourceCode: request.sourceLanguage,
          targetCode: request.targetLanguage,
          level: languageLevel,
        }

        const text = await sendMessage("executeTranslationWorkbenchRequest", {
          text: request.text,
          langConfig,
          providerConfig: provider,
          ...(headers ? { headers } : {}),
        })

        return { providerId: provider.id, status: "success", text }
      }
      catch (error) {
        return failureResult(provider.id, error)
      }
    }),
  )
}
