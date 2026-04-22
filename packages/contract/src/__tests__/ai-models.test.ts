import { describe, expect, it } from "vitest"
import { AI_MODEL_COEFFICIENTS, PRO_MODEL_WHITELIST, isProModel, normalizeTokens } from "../ai-models"

describe("@getu/contract ai-models", () => {
  it("gpt-4o-mini is the basis (input=1, output=4)", () => {
    expect(AI_MODEL_COEFFICIENTS["gpt-4o-mini"]).toEqual({ inputUnitCost: 1, outputUnitCost: 4 })
  })

  it("PRO_MODEL_WHITELIST has 3 entries", () => {
    expect(PRO_MODEL_WHITELIST).toHaveLength(3)
    expect(PRO_MODEL_WHITELIST).toEqual(
      expect.arrayContaining(["gpt-4o-mini", "claude-3-5-sonnet-latest", "gemini-2.0-flash"]),
    )
  })

  it("isProModel() accepts whitelist", () => {
    expect(isProModel("gpt-4o-mini")).toBe(true)
    expect(isProModel("gpt-4o")).toBe(false)
  })

  it("normalizeTokens() multiplies by coefficients", () => {
    // gpt-4o-mini: 100 input @1 + 200 output @4 = 100 + 800 = 900 units
    expect(normalizeTokens("gpt-4o-mini", { input: 100, output: 200 })).toBe(900)
    // claude-3-5-sonnet-latest is more expensive — verify it's >> gpt-4o-mini
    expect(normalizeTokens("claude-3-5-sonnet-latest", { input: 100, output: 200 }))
      .toBeGreaterThan(900)
  })

  it("normalizeTokens() throws on unknown model", () => {
    expect(() => normalizeTokens("gpt-9000" as never, { input: 1, output: 1 })).toThrow(/unknown/i)
  })
})
