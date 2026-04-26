import { describe, expect, it } from "vitest"
import {
  FREE_TRANSLATE_MODEL_IDS,
  PRO_TRANSLATE_MODEL_IDS,
  TRANSLATE_MODELS,
  TRANSLATE_MODEL_BY_ID,
  isFreeTranslateModel,
  isLlmTranslateModel,
  isTranslateModelId,
  normalizeTranslateTokens,
} from "../translate-models"

describe("@getu/definitions translate-models", () => {
  it("registry has exactly 11 models (2 free + 9 pro)", () => {
    expect(TRANSLATE_MODELS).toHaveLength(11)
    expect(FREE_TRANSLATE_MODEL_IDS).toHaveLength(2)
    expect(PRO_TRANSLATE_MODEL_IDS).toHaveLength(9)
  })

  it("free models are exactly google + microsoft", () => {
    expect([...FREE_TRANSLATE_MODEL_IDS].sort()).toEqual(["google", "microsoft"])
  })

  it("ids are unique", () => {
    const ids = TRANSLATE_MODELS.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("free models are translate-api kind, pro models are llm kind", () => {
    for (const id of FREE_TRANSLATE_MODEL_IDS) {
      expect(TRANSLATE_MODEL_BY_ID[id].kind).toBe("translate-api")
    }
    for (const id of PRO_TRANSLATE_MODEL_IDS) {
      expect(TRANSLATE_MODEL_BY_ID[id].kind).toBe("llm")
    }
  })

  it("TRANSLATE_MODEL_BY_ID exposes every registered model", () => {
    for (const model of TRANSLATE_MODELS) {
      expect(TRANSLATE_MODEL_BY_ID[model.id]).toBe(model)
    }
  })

  it("isTranslateModelId narrows known and unknown ids", () => {
    expect(isTranslateModelId("google")).toBe(true)
    expect(isTranslateModelId("gpt-5.5")).toBe(true)
    expect(isTranslateModelId("nonexistent-model")).toBe(false)
  })

  it("isTranslateModelId rejects prototype-chain properties (regression for #188)", () => {
    // Using the `in` operator would return true for these because they
    // exist on Object.prototype. `Object.hasOwn` correctly rejects.
    expect(isTranslateModelId("constructor")).toBe(false)
    expect(isTranslateModelId("toString")).toBe(false)
    expect(isTranslateModelId("hasOwnProperty")).toBe(false)
    expect(isTranslateModelId("__proto__")).toBe(false)
    expect(isTranslateModelId("valueOf")).toBe(false)
  })

  it("isFreeTranslateModel reflects the freeAvailable flag", () => {
    expect(isFreeTranslateModel("google")).toBe(true)
    expect(isFreeTranslateModel("microsoft")).toBe(true)
    expect(isFreeTranslateModel("gpt-5.5")).toBe(false)
    expect(isFreeTranslateModel("claude-sonnet-4-6")).toBe(false)
  })

  it("every llm model carries positive cost coefficients", () => {
    for (const id of PRO_TRANSLATE_MODEL_IDS) {
      const model = TRANSLATE_MODEL_BY_ID[id]
      if (!isLlmTranslateModel(model)) throw new Error(`expected ${id} to be llm`)
      expect(model.costCoefficients.inputUnitCost).toBeGreaterThan(0)
      expect(model.costCoefficients.outputUnitCost).toBeGreaterThan(0)
      // Output is generally pricier than input across all real LLMs.
      expect(model.costCoefficients.outputUnitCost).toBeGreaterThanOrEqual(
        model.costCoefficients.inputUnitCost,
      )
    }
  })

  it("translate-api models do not expose costCoefficients", () => {
    for (const id of FREE_TRANSLATE_MODEL_IDS) {
      const model = TRANSLATE_MODEL_BY_ID[id]
      expect(isLlmTranslateModel(model)).toBe(false)
      expect("costCoefficients" in model).toBe(false)
    }
  })

  it("normalizeTranslateTokens multiplies by coefficients", () => {
    // gpt-5.4-mini: input 1, output 4 → 100*1 + 200*4 = 900
    expect(normalizeTranslateTokens("gpt-5.4-mini", { input: 100, output: 200 })).toBe(900)
    // gemini-3-flash-preview: input 1, output 3 → 100*1 + 200*3 = 700
    expect(normalizeTranslateTokens("gemini-3-flash-preview", { input: 100, output: 200 })).toBe(
      700,
    )
    // claude-sonnet-4-6: input 20, output 75 → 100*20 + 200*75 = 17000
    expect(normalizeTranslateTokens("claude-sonnet-4-6", { input: 100, output: 200 })).toBe(17000)
  })

  it("normalizeTranslateTokens throws on translate-api models", () => {
    expect(() => normalizeTranslateTokens("google", { input: 1, output: 1 })).toThrow(
      /no token cost/,
    )
    expect(() => normalizeTranslateTokens("microsoft", { input: 1, output: 1 })).toThrow(
      /no token cost/,
    )
  })
})
