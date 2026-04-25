import { describe, expect, it } from "vitest"
import {
  FREE_TRANSLATE_MODEL_IDS,
  PRO_TRANSLATE_MODEL_IDS,
  TRANSLATE_MODELS,
  TRANSLATE_MODEL_BY_ID,
  isFreeTranslateModel,
  isTranslateModelId,
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

  it("isFreeTranslateModel reflects the freeAvailable flag", () => {
    expect(isFreeTranslateModel("google")).toBe(true)
    expect(isFreeTranslateModel("microsoft")).toBe(true)
    expect(isFreeTranslateModel("gpt-5.5")).toBe(false)
    expect(isFreeTranslateModel("claude-sonnet-4-6")).toBe(false)
  })
})
