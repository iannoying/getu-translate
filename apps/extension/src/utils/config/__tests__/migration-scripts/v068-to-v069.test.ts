import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v068-to-v069"

function createV068Config(overrides: Record<string, unknown> = {}) {
  return {
    language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
    inputTranslation: {
      enabled: true,
      providerId: "microsoft-translate-default",
      fromLang: "targetCode",
      toLang: "sourceCode",
      enableCycle: false,
      timeThreshold: 300,
    },
    ...overrides,
  }
}

describe("v068-to-v069 migration", () => {
  it("adds triggerMode=triple-space and tokenPrefix=// to inputTranslation", () => {
    const result = migrate(createV068Config())
    expect(result.inputTranslation.triggerMode).toBe("triple-space")
    expect(result.inputTranslation.tokenPrefix).toBe("//")
  })

  it("preserves other inputTranslation fields", () => {
    const result = migrate(createV068Config())
    expect(result.inputTranslation.enabled).toBe(true)
    expect(result.inputTranslation.providerId).toBe("microsoft-translate-default")
    expect(result.inputTranslation.fromLang).toBe("targetCode")
    expect(result.inputTranslation.toLang).toBe("sourceCode")
    expect(result.inputTranslation.enableCycle).toBe(false)
    expect(result.inputTranslation.timeThreshold).toBe(300)
  })

  it("preserves sibling config slices outside inputTranslation", () => {
    const result = migrate(createV068Config({
      language: { sourceCode: "auto", targetCode: "eng", level: "beginner" },
    }))
    expect(result.language.targetCode).toBe("eng")
    expect(result.language.level).toBe("beginner")
  })

  it("is idempotent when called on a config that already has the new fields", () => {
    const once = migrate(createV068Config())
    const twice = migrate(once)
    expect(twice.inputTranslation.triggerMode).toBe("triple-space")
    expect(twice.inputTranslation.tokenPrefix).toBe("//")
  })

  it("does not overwrite a user's existing triggerMode / tokenPrefix", () => {
    const custom = createV068Config({
      inputTranslation: {
        enabled: true,
        providerId: "google-translate-default",
        fromLang: "targetCode",
        toLang: "sourceCode",
        enableCycle: false,
        timeThreshold: 300,
        triggerMode: "token",
        tokenPrefix: "++",
      },
    })
    const result = migrate(custom)
    expect(result.inputTranslation.triggerMode).toBe("token")
    expect(result.inputTranslation.tokenPrefix).toBe("++")
  })

  it("does not crash when inputTranslation is missing entirely", () => {
    const bare = { language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" } }
    const result = migrate(bare)
    expect(result.inputTranslation.triggerMode).toBe("triple-space")
    expect(result.inputTranslation.tokenPrefix).toBe("//")
  })
})
