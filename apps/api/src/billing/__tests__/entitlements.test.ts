import { describe, expect, it } from "vitest"
import { loadEntitlements } from "../entitlements"

// Minimal in-memory fake for the drizzle D1 query interface we use
function fakeDb(rows: Array<{ userId: string, tier: string, features: string, expiresAt: number | null }>) {
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
    const e = await loadEntitlements(fakeDb([]), "u1")
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
    expect(e.expiresAt).toBeNull()
    expect(e.quota).toEqual({})
  })

  it("returns Pro when row exists with tier=pro and features", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1",
      tier: "pro",
      features: JSON.stringify(["ai_translate_pool", "pdf_translate"]),
      expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
    }]), "u1")
    expect(e.tier).toBe("pro")
    expect(e.features).toContain("ai_translate_pool")
    expect(e.expiresAt).toBe("2099-01-01T00:00:00.000Z")
  })

  it("downgrades to FREE when expiresAt is in the past", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1", tier: "pro",
      features: JSON.stringify(["ai_translate_pool"]),
      expiresAt: Date.now() - 86400_000,
    }]), "u1")
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
  })

  it("rejects malformed features JSON by falling back to FREE features", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1", tier: "pro",
      features: "not-json", expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
    }]), "u1")
    expect(e.features).toEqual([])
  })
})
