import type { TranslationRequestSnapshot, TranslationResultState, TranslationWorkbenchPlan } from "./types"
import type { Config } from "@/types/config/config"
import type { TranslateProviderConfig } from "@/types/config/provider"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { orpcClient } from "@/utils/orpc/client"
import { getTranslatePrompt } from "@/utils/prompts/translate"
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "translation failed"
}

export async function runTranslationWorkbenchRequest({
  plan,
  userId,
  request,
  providers,
  languageLevel,
}: RunTranslationWorkbenchRequestInput): Promise<TranslationResultState[]> {
  const runnable: TranslateProviderConfig[] = []
  const gated: TranslationResultState[] = []

  for (const provider of providers) {
    if (!provider.enabled) {
      gated.push({
        providerId: provider.id,
        status: "error",
        errorMessage: "Provider is disabled",
      })
      continue
    }

    const gate = getProviderGate(provider, plan)
    if (gate === "login-required" || gate === "upgrade-required") {
      gated.push({ providerId: provider.id, status: gate })
      continue
    }

    runnable.push(provider)
  }

  if (userId !== null && runnable.length > 0) {
    await orpcClient.billing.consumeQuota({
      bucket: "web_text_translate_monthly",
      amount: 1,
      request_id: buildSidebarClickRequestId(request.clickId),
    })
  }

  const settled = await Promise.all(
    runnable.map(async (provider): Promise<TranslationResultState> => {
      try {
        const headers = isGetuProProvider(provider)
          ? {
              "x-request-id": buildSidebarTokenRequestId(request.clickId, provider.id),
              "x-getu-quota-bucket": "web_text_translate_token_monthly",
            }
          : undefined

        const text = await executeTranslate(
          request.text,
          {
            sourceCode: request.sourceLanguage,
            targetCode: request.targetLanguage,
            level: languageLevel,
          },
          provider,
          getTranslatePrompt,
          headers ? { headers } : undefined,
        )

        return { providerId: provider.id, status: "success", text }
      }
      catch (error) {
        const message = errorMessage(error)
        const status = /quota|limit|exceeded|FORBIDDEN/i.test(message) ? "quota-exhausted" : "error"
        return { providerId: provider.id, status, errorMessage: message }
      }
    }),
  )

  return [...gated, ...settled]
}
