import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v070-to-v071"

function createV070Config(overrides: Record<string, unknown> = {}) {
  return {
    language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
    pdfTranslation: {
      enabled: true,
      activationMode: "ask",
      blocklistDomains: [],
      allowFileProtocol: false,
    },
    siteControl: {
      mode: "blacklist",
      blacklistPatterns: [],
      whitelistPatterns: [],
    },
    providersConfig: [
      { id: "microsoft-translate-default", name: "Microsoft Translator", enabled: true, provider: "microsoft-translate" },
      { id: "openai-default", name: "OpenAI", enabled: true, provider: "openai", model: { model: "gpt-5-mini", isCustomModel: false, customModel: null } },
    ],
    ...overrides,
  }
}

describe("migrate v070 → v071", () => {
  it("inserts getu-pro at position 0 when not present", () => {
    const result = migrate(createV070Config())
    expect(result.providersConfig[0].provider).toBe("getu-pro")
    expect(result.providersConfig[0].id).toBe("getu-pro-default")
    expect(result.providersConfig[0].model.model).toBe("gpt-4o-mini")
  })

  it("preserves existing providers after getu-pro", () => {
    const base = createV070Config()
    const result = migrate(base)
    expect(result.providersConfig).toHaveLength(3)
    expect(result.providersConfig[1].provider).toBe("microsoft-translate")
    expect(result.providersConfig[2].provider).toBe("openai")
  })

  it("is idempotent — does not duplicate getu-pro if already present", () => {
    const withGetuPro = createV070Config({
      providersConfig: [
        { id: "getu-pro-default", name: "GetU Translate Pro", enabled: true, provider: "getu-pro", model: { model: "gpt-4o-mini", isCustomModel: false, customModel: null } },
        { id: "openai-default", name: "OpenAI", enabled: true, provider: "openai", model: { model: "gpt-5-mini", isCustomModel: false, customModel: null } },
      ],
    })
    const result = migrate(withGetuPro)
    const getuProEntries = result.providersConfig.filter((p: any) => p.provider === "getu-pro")
    expect(getuProEntries).toHaveLength(1)
    expect(result.providersConfig).toHaveLength(2)
  })

  it("keeps all other config fields untouched", () => {
    const base = createV070Config()
    const result = migrate(base)
    expect(result.pdfTranslation).toEqual(base.pdfTranslation)
    expect(result.siteControl).toEqual(base.siteControl)
    expect(result.language).toEqual(base.language)
  })

  it("handles missing providersConfig gracefully", () => {
    const result = migrate({ language: { sourceCode: "auto", targetCode: "en" } })
    expect(result.providersConfig[0].provider).toBe("getu-pro")
    expect(result.providersConfig).toHaveLength(1)
  })

  it("handles undefined oldConfig gracefully", () => {
    const result = migrate(undefined)
    expect(result.providersConfig[0].provider).toBe("getu-pro")
  })
})
