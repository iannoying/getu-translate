import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v069-to-v070"

function createV069Config(overrides: Record<string, unknown> = {}) {
  return {
    language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
    inputTranslation: {
      enabled: true,
      providerId: "microsoft-translate-default",
      fromLang: "targetCode",
      toLang: "sourceCode",
      enableCycle: false,
      timeThreshold: 300,
      triggerMode: "triple-space",
      tokenPrefix: "//",
    },
    siteControl: {
      mode: "blacklist",
      blacklistPatterns: [],
      whitelistPatterns: [],
    },
    ...overrides,
  }
}

describe("migrate v069 → v070", () => {
  it("adds default pdfTranslation when missing", () => {
    const result = migrate(createV069Config())
    expect(result.pdfTranslation).toEqual({
      enabled: true,
      activationMode: "ask",
      blocklistDomains: [],
      allowFileProtocol: false,
    })
  })

  it("preserves existing pdfTranslation (idempotent)", () => {
    const custom = {
      ...createV069Config(),
      pdfTranslation: {
        enabled: false,
        activationMode: "manual",
        blocklistDomains: ["evil.com"],
        allowFileProtocol: true,
      },
    }
    expect(migrate(custom).pdfTranslation).toEqual({
      enabled: false,
      activationMode: "manual",
      blocklistDomains: ["evil.com"],
      allowFileProtocol: true,
    })
  })

  it("keeps all other fields untouched", () => {
    const base = createV069Config()
    const result = migrate(base)
    expect(result.inputTranslation).toEqual(base.inputTranslation)
    expect(result.siteControl).toEqual(base.siteControl)
  })

  it("handles undefined oldConfig gracefully", () => {
    // spread of undefined/null produces empty object; pdfTranslation default still added
    const result = migrate(undefined)
    expect(result.pdfTranslation.activationMode).toBe("ask")
  })
})
