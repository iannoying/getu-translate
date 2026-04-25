import { describe, expect, it } from "vitest"
import { AI_MODEL_COEFFICIENTS, PRO_MODEL_WHITELIST, isProModel, normalizeTokens } from "../ai-models"

describe("@getu/contract ai-models", () => {
  it("deepseek-v4-pro is the baseline Pro model (input=1, output=4)", () => {
    expect(AI_MODEL_COEFFICIENTS["deepseek-v4-pro"]).toEqual({ inputUnitCost: 1, outputUnitCost: 4 })
  })

  it("PRO_MODEL_WHITELIST has the bianxie model ids exposed by GetU Pro", () => {
    expect(PRO_MODEL_WHITELIST).toEqual([
      "deepseek-v4-pro",
      "qwen3.5-plus",
      "glm-5.1",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
      "gpt-5.5",
      "claude-sonnet-4-6",
    ])
  })

  it("isProModel() accepts whitelist", () => {
    expect(isProModel("deepseek-v4-pro")).toBe(true)
    expect(isProModel("qwen3.5-plus")).toBe(true)
    expect(isProModel("gpt-4o")).toBe(false)
  })

  it("normalizeTokens() multiplies by coefficients", () => {
    // deepseek-v4-pro: 100 input @1 + 200 output @4 = 100 + 800 = 900 units
    expect(normalizeTokens("deepseek-v4-pro", { input: 100, output: 200 })).toBe(900)
    // claude-sonnet-4-6 currently uses the same baseline quota coefficient.
    expect(normalizeTokens("claude-sonnet-4-6", { input: 100, output: 200 })).toBe(900)
  })

  it("normalizeTokens() throws on unknown model", () => {
    expect(() => normalizeTokens("gpt-9000" as never, { input: 1, output: 1 })).toThrow(/unknown/i)
  })
})
