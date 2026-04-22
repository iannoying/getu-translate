import { describe, expect, it } from "vitest"
import {
  EntitlementsSchema,
  FREE_ENTITLEMENTS,
  hasFeature,
  isPro,
  consumeQuotaInputSchema,
  consumeQuotaOutputSchema,
  QUOTA_BUCKETS,
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

describe("billing.consumeQuota contract", () => {
  it("input accepts valid shape", () => {
    expect(() => consumeQuotaInputSchema.parse({
      bucket: "ai_translate_monthly",
      amount: 100,
      request_id: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    })).not.toThrow()
  })
  it("input rejects amount=0", () => {
    expect(() => consumeQuotaInputSchema.parse({
      bucket: "ai_translate_monthly", amount: 0, request_id: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    })).toThrow()
  })
  it("input rejects unknown bucket", () => {
    expect(() => consumeQuotaInputSchema.parse({
      bucket: "gold_credits", amount: 1, request_id: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    } as any)).toThrow()
  })
  it("output shape", () => {
    expect(() => consumeQuotaOutputSchema.parse({
      bucket: "ai_translate_monthly", remaining: 99900, reset_at: "2026-05-01T00:00:00.000Z",
    })).not.toThrow()
  })
  it("QUOTA_BUCKETS enumerates all contract-defined buckets", () => {
    expect(QUOTA_BUCKETS).toEqual(expect.arrayContaining([
      "input_translate_daily", "pdf_translate_daily", "vocab_count", "ai_translate_monthly",
    ]))
  })
})
