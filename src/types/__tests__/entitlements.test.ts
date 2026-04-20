import type { Entitlements } from "../entitlements"
import { describe, expect, it } from "vitest"
import { EntitlementsSchema, FREE_ENTITLEMENTS, hasFeature, isPro } from "../entitlements"

describe("entitlementsSchema", () => {
  it("validates a free user", () => {
    expect(() => EntitlementsSchema.parse(FREE_ENTITLEMENTS)).not.toThrow()
  })

  it("validates a pro user with expiry and features", () => {
    const pro: Entitlements = {
      tier: "pro",
      features: ["pdf_translate", "input_translate_unlimited"],
      quota: { ai_translate_monthly: { used: 1200, limit: 50000 } },
      expiresAt: "2027-01-01T00:00:00.000Z",
    }
    expect(() => EntitlementsSchema.parse(pro)).not.toThrow()
  })

  it("rejects unknown tier", () => {
    expect(() =>
      EntitlementsSchema.parse({ tier: "gold", features: [], quota: {}, expiresAt: null }),
    ).toThrow()
  })

  it("rejects unknown feature key", () => {
    expect(() =>
      EntitlementsSchema.parse({
        tier: "pro",
        features: ["nonexistent_feature"],
        quota: {},
        expiresAt: null,
      }),
    ).toThrow()
  })

  it("rejects non-ISO expiresAt", () => {
    expect(() =>
      EntitlementsSchema.parse({
        tier: "pro",
        features: [],
        quota: {},
        expiresAt: "not a date",
      }),
    ).toThrow()
  })

  it("rejects negative quota usage", () => {
    expect(() =>
      EntitlementsSchema.parse({
        tier: "pro",
        features: [],
        quota: { bucket: { used: -1, limit: 10 } },
        expiresAt: null,
      }),
    ).toThrow()
  })
})

describe("hasFeature", () => {
  it("returns true when feature is granted", () => {
    const e: Entitlements = {
      tier: "pro",
      features: ["pdf_translate"],
      quota: {},
      expiresAt: null,
    }
    expect(hasFeature(e, "pdf_translate")).toBe(true)
  })

  it("returns false when feature is not granted", () => {
    expect(hasFeature(FREE_ENTITLEMENTS, "pdf_translate")).toBe(false)
  })
})

describe("isPro", () => {
  it("is false for free tier", () => {
    expect(isPro(FREE_ENTITLEMENTS)).toBe(false)
  })

  it("is true for pro with future expiry", () => {
    const e: Entitlements = {
      tier: "pro",
      features: [],
      quota: {},
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    }
    expect(isPro(e)).toBe(true)
  })

  it("is false for pro with past expiry", () => {
    const e: Entitlements = {
      tier: "pro",
      features: [],
      quota: {},
      expiresAt: new Date(Date.now() - 86400_000).toISOString(),
    }
    expect(isPro(e)).toBe(false)
  })

  it("is true for enterprise with null expiry", () => {
    const e: Entitlements = {
      tier: "enterprise",
      features: [],
      quota: {},
      expiresAt: null,
    }
    expect(isPro(e)).toBe(true)
  })

  it("is false for pro with null expiry (defensive)", () => {
    // null expiresAt on 'pro' is an invariant violation from backend;
    // treat as not-pro rather than forever-pro.
    const e: Entitlements = {
      tier: "pro",
      features: [],
      quota: {},
      expiresAt: null,
    }
    expect(isPro(e)).toBe(false)
  })

  it("accepts an injectable now() for deterministic testing", () => {
    const frozenNow = Date.parse("2026-01-01T00:00:00.000Z")
    const e: Entitlements = {
      tier: "pro",
      features: [],
      quota: {},
      expiresAt: "2025-12-31T00:00:00.000Z",
    }
    expect(isPro(e, () => frozenNow)).toBe(false)
  })
})
