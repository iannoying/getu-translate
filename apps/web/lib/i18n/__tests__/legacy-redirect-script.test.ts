import { describe, expect, it } from "vitest"
import { buildLegacyLocaleRedirectScript } from "../legacy-redirect-script"

describe("legacy locale redirect script", () => {
  it("builds a synchronous browser redirect without visible fallback UI", () => {
    const script = buildLegacyLocaleRedirectScript("/pricing")

    expect(script).toContain("window.location.replace")
    expect(script).toContain("getu:web-locale")
    expect(script).toContain("pricing")
    expect(script).toContain("price")
    expect(script).not.toContain("GetU Translate")
    expect(script).not.toContain("English")
    expect(script).not.toContain("简体中文")
    expect(script).not.toContain("繁體中文")
  })
})
