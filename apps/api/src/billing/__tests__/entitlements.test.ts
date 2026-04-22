import { describe, expect, it } from "vitest"
import { loadEntitlements } from "../entitlements"

// Minimal in-memory fake for the drizzle D1 query interface we use
function fakeDb(rows: Array<{
  userId: string
  tier: string
  features: string
  expiresAt: number | null
  graceUntil?: number | null
  billingProvider?: string | null
}>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => rows[0] ?? undefined,
        }),
      }),
    }),
  } as any
}

describe("loadEntitlements", () => {
  it("returns FREE when no row exists", async () => {
    const e = await loadEntitlements(fakeDb([]), "u1", false)
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
    expect(e.expiresAt).toBeNull()
    expect(e.quota).toEqual({})
    expect(e.graceUntil).toBeNull()
    expect(e.billingEnabled).toBe(false)
    expect(e.billingProvider).toBeNull()
  })

  it("passes billingEnabled through on missing row", async () => {
    const e = await loadEntitlements(fakeDb([]), "u1", true)
    expect(e.billingEnabled).toBe(true)
  })

  it("returns Pro when row exists with tier=pro and features", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1",
      tier: "pro",
      features: JSON.stringify(["ai_translate_pool", "pdf_translate"]),
      expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
      graceUntil: null,
      billingProvider: "paddle",
    }]), "u1", true)
    expect(e.tier).toBe("pro")
    expect(e.features).toContain("ai_translate_pool")
    expect(e.expiresAt).toBe("2099-01-01T00:00:00.000Z")
    expect(e.graceUntil).toBeNull()
    expect(e.billingEnabled).toBe(true)
    expect(e.billingProvider).toBe("paddle")
  })

  it("downgrades to FREE when expiresAt is in the past", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1", tier: "pro",
      features: JSON.stringify(["ai_translate_pool"]),
      expiresAt: Date.now() - 86400_000,
      graceUntil: null,
      billingProvider: null,
    }]), "u1", false)
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
  })

  it("rejects malformed features JSON by falling back to FREE features", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1", tier: "pro",
      features: "not-json", expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
      graceUntil: null,
      billingProvider: null,
    }]), "u1", false)
    expect(e.features).toEqual([])
  })

  it("returns enterprise tier with null expiresAt as Pro (no expiry)", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1",
      tier: "enterprise",
      features: JSON.stringify(["enterprise_glossary_share"]),
      expiresAt: null,
      graceUntil: null,
      billingProvider: null,
    }]), "u1", false)
    expect(e.tier).toBe("enterprise")
    expect(e.features).toContain("enterprise_glossary_share")
    expect(e.expiresAt).toBeNull()
    expect(e.graceUntil).toBeNull()
    expect(e.billingProvider).toBeNull()
  })

  it("surfaces graceUntil as ISO string when present", async () => {
    const graceMs = Date.parse("2099-06-01T00:00:00.000Z")
    const e = await loadEntitlements(fakeDb([{
      userId: "u1",
      tier: "pro",
      features: JSON.stringify(["ai_translate_pool"]),
      expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
      graceUntil: graceMs,
      billingProvider: "stripe",
    }]), "u1", true)
    expect(e.graceUntil).toBe("2099-06-01T00:00:00.000Z")
    expect(e.billingProvider).toBe("stripe")
  })
})
