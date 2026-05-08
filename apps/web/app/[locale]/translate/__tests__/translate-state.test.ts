import { describe, expect, it } from "vitest"
import { FREE_ENTITLEMENTS } from "@getu/contract"
import {
  getInvokableModels,
  resolveTranslatePlan,
  shouldDisableTranslate,
} from "../translate-state"

describe("translate state resolution", () => {
  it("keeps a signed-in user non-invokable while entitlements are still loading", () => {
    const state = resolveTranslatePlan({
      isAuthed: true,
      entitlements: null,
      entitlementsLoaded: false,
    })

    expect(state).toBe("loading")
    expect(getInvokableModels(state)).toEqual([])
    expect(shouldDisableTranslate({
      isAuthed: true,
      plan: state,
      text: "hello",
      overLimit: false,
      isTranslating: false,
    })).toBe(true)
  })

  it("falls back to free once entitlements loading finishes without data", () => {
    const state = resolveTranslatePlan({
      isAuthed: true,
      entitlements: null,
      entitlementsLoaded: true,
    })

    expect(state).toBe("free")
    expect(getInvokableModels(state)).toEqual(["google", "microsoft"])
  })

  it("uses the loaded entitlement tier when available", () => {
    expect(resolveTranslatePlan({
      isAuthed: true,
      entitlements: FREE_ENTITLEMENTS,
      entitlementsLoaded: true,
    })).toBe("free")
  })
})
