import type { PromptResolver } from "./api/ai"
import type { FreeTranslateImpl } from "./api/dispatch"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { ISO6393_TO_6391, LANG_CODE_TO_EN_NAME } from "@read-frog/definitions"
import { isLLMProviderConfig, isNonAPIProvider, isPureAPIProvider } from "@/types/config/provider"
import { aiTranslate } from "./api/ai"
import { deeplTranslate } from "./api/deepl"
import { deeplxTranslate } from "./api/deeplx"
import { DEFAULT_ORDER, defaultHealth, defaultImpls, dispatchFreeTranslate } from "./api/dispatch"
import { translateLibre } from "./api/libre"
import { prepareTranslationText } from "./text-preparation"

export async function executeTranslate<TContext>(
  text: string,
  langConfig: Config["language"],
  providerConfig: ProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: {
    forceBackgroundFetch?: boolean
    isBatch?: boolean
    context?: TContext
  },
) {
  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const { provider } = providerConfig
  let translatedText = ""

  if (isNonAPIProvider(provider)) {
    const sourceLang = langConfig.sourceCode === "auto" ? "auto" : (ISO6393_TO_6391[langConfig.sourceCode] ?? "auto")
    const targetLang = ISO6393_TO_6391[langConfig.targetCode]
    if (!targetLang) {
      throw new Error(`Invalid target language code: ${langConfig.targetCode}`)
    }

    // Map from options provider-id (e.g. "bing-translate") to ProviderKind (e.g. "bing")
    // used by dispatchFreeTranslate.
    const PROVIDER_ID_TO_KIND: Record<string, typeof DEFAULT_ORDER[number]> = {
      "google-translate": "google",
      "microsoft-translate": "microsoft",
      "bing-translate": "bing",
      "yandex-translate": "yandex",
    }

    // Route through dispatchFreeTranslate so the circuit-breaker and fallback
    // chain from M1 Task 5 are always in the live path.
    //
    // Option A: start with the user's chosen provider, then fall through to
    // others on failure — delivers the M1 resilience promise while still
    // honouring the user's preference as the first attempt.
    const preferredKind = PROVIDER_ID_TO_KIND[provider]
    const order = preferredKind
      ? [preferredKind, ...DEFAULT_ORDER.filter(k => k !== preferredKind)]
      : DEFAULT_ORDER

    // Inject a LibreTranslate impl if the user has configured an endpoint,
    // so it can participate in the fallback chain.
    const libreConfig = providerConfig as Record<string, unknown>
    const libreEndpoint = typeof libreConfig.endpoint === "string" ? libreConfig.endpoint : undefined
    const libreImpl: FreeTranslateImpl | undefined = libreEndpoint
      ? async input => translateLibre({
        text: input.text,
        from: input.from,
        to: input.to,
        endpoint: libreEndpoint,
        apiKey: typeof libreConfig.apiKey === "string" ? libreConfig.apiKey : undefined,
      })
      : undefined

    const finalOrder = libreImpl ? [...order, "libre" as const] : order
    const impls = libreImpl ? { ...defaultImpls, libre: libreImpl } : defaultImpls

    const result = await dispatchFreeTranslate(
      { text: preparedText, from: sourceLang, to: targetLang },
      { order: finalOrder, impls, health: defaultHealth },
    )
    translatedText = result.text
  }
  else if (isPureAPIProvider(provider)) {
    const sourceLang = langConfig.sourceCode === "auto" ? "auto" : (ISO6393_TO_6391[langConfig.sourceCode] ?? "auto")
    const targetLang = ISO6393_TO_6391[langConfig.targetCode]
    if (!targetLang) {
      throw new Error(`Invalid target language code: ${langConfig.targetCode}`)
    }
    if (provider === "deeplx") {
      translatedText = await deeplxTranslate(preparedText, sourceLang, targetLang, providerConfig, options)
    }
    else if (provider === "deepl") {
      translatedText = await deeplTranslate(text, sourceLang, targetLang, providerConfig, options)
    }
    else if (provider === "libre-translate") {
      const libreConfig = providerConfig as Extract<ProviderConfig, { provider: "libre-translate" }>
      const result = await translateLibre({
        text: preparedText,
        from: sourceLang,
        to: targetLang,
        endpoint: libreConfig.endpoint,
        apiKey: libreConfig.apiKey,
      })
      translatedText = result.text
    }
  }
  else if (isLLMProviderConfig(providerConfig)) {
    const targetLangName = LANG_CODE_TO_EN_NAME[langConfig.targetCode]
    translatedText = await aiTranslate(preparedText, targetLangName, providerConfig, promptResolver, options)
  }
  else {
    throw new Error(`Unknown provider: ${provider}`)
  }

  return translatedText.trim()
}
