import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v067-to-v068"

function createV067Config(overrides: Record<string, unknown> = {}) {
  return {
    language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
    providersConfig: [
      { id: "microsoft-translate-default", enabled: true, name: "Microsoft Translator", provider: "microsoft-translate" },
      { id: "google-translate-default", enabled: true, name: "Google Translate", provider: "google-translate" },
    ],
    translate: { providerId: "microsoft-translate-default" },
    ...overrides,
  }
}

describe("v067-to-v068 migration", () => {
  it("adds bing-translate-default to providersConfig", () => {
    const result = migrate(createV067Config())
    const bingProvider = result.providersConfig.find((p: any) => p.provider === "bing-translate")
    expect(bingProvider).toBeDefined()
    expect(bingProvider.id).toBe("bing-translate-default")
    expect(bingProvider.enabled).toBe(true)
    expect(bingProvider.name).toBe("Bing Translate")
  })

  it("adds yandex-translate-default to providersConfig", () => {
    const result = migrate(createV067Config())
    const yandexProvider = result.providersConfig.find((p: any) => p.provider === "yandex-translate")
    expect(yandexProvider).toBeDefined()
    expect(yandexProvider.id).toBe("yandex-translate-default")
    expect(yandexProvider.enabled).toBe(true)
    expect(yandexProvider.name).toBe("Yandex Translate")
  })

  it("adds libre-translate-default to providersConfig with empty endpoint", () => {
    const result = migrate(createV067Config())
    const libreProvider = result.providersConfig.find((p: any) => p.provider === "libre-translate")
    expect(libreProvider).toBeDefined()
    expect(libreProvider.id).toBe("libre-translate-default")
    expect(libreProvider.enabled).toBe(true)
    expect(libreProvider.name).toBe("LibreTranslate")
    expect(libreProvider.endpoint).toBe("")
    expect(libreProvider.apiKey).toBeUndefined()
  })

  it("preserves existing providers", () => {
    const result = migrate(createV067Config())
    const msProvider = result.providersConfig.find((p: any) => p.provider === "microsoft-translate")
    const googleProvider = result.providersConfig.find((p: any) => p.provider === "google-translate")
    expect(msProvider).toBeDefined()
    expect(googleProvider).toBeDefined()
  })

  it("preserves the user's currently selected translate provider", () => {
    const result = migrate(createV067Config({ translate: { providerId: "google-translate-default" } }))
    expect(result.translate.providerId).toBe("google-translate-default")
  })

  it("does not add providers if already present (idempotent for existing providers)", () => {
    const config = createV067Config({
      providersConfig: [
        { id: "microsoft-translate-default", enabled: true, name: "Microsoft Translator", provider: "microsoft-translate" },
        { id: "bing-translate-default", enabled: false, name: "Bing Translate", provider: "bing-translate" },
      ],
    })
    const result = migrate(config)
    const bingProviders = result.providersConfig.filter((p: any) => p.provider === "bing-translate")
    expect(bingProviders).toHaveLength(1)
    // existing one preserved, not overwritten
    expect(bingProviders[0].enabled).toBe(false)
  })
})
