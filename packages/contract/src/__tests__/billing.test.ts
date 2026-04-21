import { describe, expect, it } from "vitest"
import {
  EntitlementsSchema,
  FREE_ENTITLEMENTS,
  hasFeature,
  isPro,
} from "../billing"

describe("@getu/contract billing", () => {
  it("FREE_ENTITLEMENTS parses", () => {
    expect(() => EntitlementsSchema.parse(FREE_ENTITLEMENTS)).not.toThrow()
  })

  it("rejects invalid tier", () => {
    expect(() =>
      EntitlementsSchema.parse({
        tier: "gold",
        features: [],
        quota: {},
        expiresAt: null,
      }),
    ).toThrow()
  })

  it("hasFeature returns false for free tier with no features", () => {
    expect(hasFeature(FREE_ENTITLEMENTS, "pdf_translate")).toBe(false)
  })

  it("isPro returns false for free tier", () => {
    expect(isPro(FREE_ENTITLEMENTS)).toBe(false)
  })

  it("isPro returns true for pro tier with future expiry", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
    const proEntitlements = EntitlementsSchema.parse({
      tier: "pro",
      features: ["pdf_translate"],
      quota: {},
      expiresAt: future,
    })
    expect(isPro(proEntitlements)).toBe(true)
  })
})
