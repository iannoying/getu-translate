import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v071-to-v072"

function createV071Config(overrides: Record<string, unknown> = {}) {
  return {
    language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
    pdfTranslation: {
      enabled: true,
      activationMode: "ask",
      blocklistDomains: ["evil.com"],
      allowFileProtocol: false,
    },
    siteControl: {
      mode: "blacklist",
      blacklistPatterns: [],
      whitelistPatterns: [],
    },
    providersConfig: [
      { id: "getu-pro-default", name: "GetU Translate Pro", enabled: true, provider: "getu-pro" },
    ],
    ...overrides,
  }
}

describe("migrate v071 → v072", () => {
  it("drops the pdfTranslation field", () => {
    const result = migrate(createV071Config())
    expect(result).not.toHaveProperty("pdfTranslation")
  })

  it("keeps every other top-level field untouched", () => {
    const base = createV071Config()
    const result = migrate(base)
    expect(result.language).toEqual(base.language)
    expect(result.siteControl).toEqual(base.siteControl)
    expect(result.providersConfig).toEqual(base.providersConfig)
  })

  it("is idempotent — re-running on output is a no-op", () => {
    const once = migrate(createV071Config())
    const twice = migrate(once)
    expect(twice).toEqual(once)
  })

  it("handles configs that already lack pdfTranslation", () => {
    const without = createV071Config()
    delete (without as any).pdfTranslation
    const result = migrate(without)
    expect(result).not.toHaveProperty("pdfTranslation")
    expect(result.siteControl).toEqual(without.siteControl)
  })

  it("returns null/undefined unchanged", () => {
    expect(migrate(undefined)).toBeUndefined()
    expect(migrate(null)).toBeNull()
  })
})
