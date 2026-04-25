import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v072-to-v073"

function createV072Config(overrides: Record<string, unknown> = {}) {
  return {
    language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
    translate: {
      providerId: "getu-pro-default",
    },
    providersConfig: [
      {
        id: "getu-pro-default",
        name: "GetU Translate Pro",
        description: "AI translations powered by your GetU Pro subscription.",
        enabled: true,
        provider: "getu-pro",
        model: { model: "gpt-4o-mini", isCustomModel: false, customModel: null },
      },
      { id: "microsoft-translate-default", name: "Microsoft Translator", enabled: true, provider: "microsoft-translate" },
      { id: "openai-default", name: "OpenAI", enabled: true, provider: "openai", model: { model: "gpt-5-mini", isCustomModel: false, customModel: null } },
    ],
    ...overrides,
  }
}

describe("migrate v072 -> v073", () => {
  it("replaces the single getu-pro provider with model-specific entries", () => {
    const result = migrate(createV072Config())
    const getuProProviders = result.providersConfig.filter((p: any) => p.provider === "getu-pro")

    expect(getuProProviders).toHaveLength(7)
    expect(getuProProviders.map((p: any) => [p.name, p.model.model])).toEqual([
      ["DeepSeek-V4-Pro", "deepseek-v4-pro"],
      ["Qwen3.5-plus", "qwen3.5-plus"],
      ["Glm-5.2", "glm-5.1"],
      ["Gemini-3-flash-preview", "gemini-3-flash-preview"],
      ["Gemini-3.1-pro", "gemini-3.1-pro-preview"],
      ["Gpt-5.5", "gpt-5.5"],
      ["Claude-sonnet-4.6", "claude-sonnet-4-6"],
    ])
  })

  it("keeps the default getu-pro id so existing feature references remain valid", () => {
    const result = migrate(createV072Config())
    expect(result.providersConfig[0].id).toBe("getu-pro-default")
    expect(result.providersConfig[0].name).toBe("DeepSeek-V4-Pro")
    expect(result.translate.providerId).toBe("getu-pro-default")
  })

  it("preserves non-getu-pro providers after the new Pro entries", () => {
    const result = migrate(createV072Config())
    expect(result.providersConfig[7].provider).toBe("microsoft-translate")
    expect(result.providersConfig[8].provider).toBe("openai")
  })

  it("is idempotent for repeated migration attempts", () => {
    const once = migrate(createV072Config())
    const twice = migrate(once)
    const getuProProviders = twice.providersConfig.filter((p: any) => p.provider === "getu-pro")

    expect(getuProProviders).toHaveLength(7)
    expect(twice.providersConfig).toHaveLength(9)
  })

  it("handles missing providersConfig gracefully", () => {
    const result = migrate({ language: { sourceCode: "auto", targetCode: "en" } })
    expect(result.providersConfig).toHaveLength(7)
    expect(result.providersConfig[0].provider).toBe("getu-pro")
  })
})
