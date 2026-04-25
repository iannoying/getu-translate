import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v074-to-v075"

describe("migrate v074 -> v075", () => {
  it("renames the GetU Pro Gemini 3 Flash display label", () => {
    const result = migrate({
      providersConfig: [
        { id: "getu-pro-gemini-3-flash-preview", name: "Gemini-3-flash-preview", provider: "getu-pro" },
        { id: "getu-pro-gemini-31-pro", name: "Gemini-3.1-pro", provider: "getu-pro" },
      ],
    })

    expect(result.providersConfig[0].name).toBe("Gemini-3-flash")
    expect(result.providersConfig[1].name).toBe("Gemini-3.1-pro")
  })

  it("drops pdfTranslation defensively for local pre-rebase test builds", () => {
    const result = migrate({
      pdfTranslation: { enabled: true },
      providersConfig: [
        { id: "getu-pro-gemini-3-flash-preview", name: "Gemini-3-flash", provider: "getu-pro" },
      ],
    })

    expect(result).not.toHaveProperty("pdfTranslation")
    expect(result.providersConfig[0].name).toBe("Gemini-3-flash")
  })

  it("leaves already-correct labels unchanged", () => {
    const config = {
      providersConfig: [
        { id: "getu-pro-gemini-3-flash-preview", name: "Gemini-3-flash", provider: "getu-pro" },
      ],
    }

    expect(migrate(config)).toEqual(config)
  })
})
