import { describe, expect, it } from "vitest"
import { loadEntitlements } from "../entitlements"

type EntitlementRow = {
  userId: string
  tier: string
  features: string
  expiresAt: number | null
  graceUntil?: number | null
  billingProvider?: string | null
}

type QuotaPeriodRow = {
  userId: string
  bucket: string
  periodKey: string
  used: number
  updatedAt: number
}

/**
 * Minimal in-memory fake for the drizzle D1 query interface used by
 * loadEntitlements. Supports two shapes:
 *   - .get()  — used for userEntitlements (single-row lookup)
 *   - .all()  — used for quotaPeriod (multi-row scan)
 */
function fakeDb(
  entRows: EntitlementRow[],
  quotaRows: QuotaPeriodRow[] = [],
) {
  // Track which `from()` table was referenced so we can route correctly.
  // Drizzle table objects are plain objects; we key off the table name string
  // embedded in the symbol-less object by checking a known field name.
  return {
    select: () => ({
      from: (table: any) => {
        const isQuotaPeriod = "period_key" in (table[Object.getOwnPropertySymbols(table)[0] ?? ""] ?? {})
          || table?._.name === "quota_period"
          || JSON.stringify(table).includes("quota_period")
        return {
          where: () => ({
            get: async () => entRows[0] ?? undefined,
            all: async () => quotaRows,
          }),
        }
      },
    }),
  } as any
}

// Simplified fakeDb that always returns entitlements row via get() and
// quota rows via all(), regardless of table argument. This works because
// loadEntitlements always does exactly one get() (userEntitlements) then
// one all() (quotaPeriod).
function makeDb(entRows: EntitlementRow[], quotaRows: QuotaPeriodRow[] = []) {
  let callCount = 0
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => entRows[0] ?? undefined,
          all: async () => quotaRows,
        }),
      }),
    }),
  } as any
}

const PRO_EXPIRES_MS = Date.parse("2099-01-01T00:00:00.000Z")

describe("loadEntitlements", () => {
  it("returns FREE when no row exists", async () => {
    const e = await loadEntitlements(makeDb([]), "u1", false)
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
    expect(e.expiresAt).toBeNull()
    expect(e.graceUntil).toBeNull()
    expect(e.billingEnabled).toBe(false)
    expect(e.billingProvider).toBeNull()
    // M6.7: quota is now always enriched — even for free/missing rows
    expect(e.quota).toHaveProperty("web_text_translate_monthly")
  })

  it("passes billingEnabled through on missing row", async () => {
    const e = await loadEntitlements(makeDb([]), "u1", true)
    expect(e.billingEnabled).toBe(true)
  })

  it("returns Pro when row exists with tier=pro and features", async () => {
    const e = await loadEntitlements(makeDb([{
      userId: "u1",
      tier: "pro",
      features: JSON.stringify(["ai_translate_pool", "pdf_translate"]),
      expiresAt: PRO_EXPIRES_MS,
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
    const e = await loadEntitlements(makeDb([{
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
    const e = await loadEntitlements(makeDb([{
      userId: "u1", tier: "pro",
      features: "not-json", expiresAt: PRO_EXPIRES_MS,
      graceUntil: null,
      billingProvider: null,
    }]), "u1", false)
    expect(e.features).toEqual([])
  })

  it("returns enterprise tier with null expiresAt as Pro (no expiry)", async () => {
    const e = await loadEntitlements(makeDb([{
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
    const e = await loadEntitlements(makeDb([{
      userId: "u1",
      tier: "pro",
      features: JSON.stringify(["ai_translate_pool"]),
      expiresAt: PRO_EXPIRES_MS,
      graceUntil: graceMs,
      billingProvider: "stripe",
    }]), "u1", true)
    expect(e.graceUntil).toBe("2099-06-01T00:00:00.000Z")
    expect(e.billingProvider).toBe("stripe")
  })
})

describe("loadEntitlements — quota enrichment (M6.7)", () => {
  const now = new Date()
  const currentPk = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`

  it("free tier: quota has 3 web buckets with correct limits and zero used when no rows", async () => {
    const e = await loadEntitlements(makeDb([]), "u1", false)
    expect(e.quota["web_text_translate_monthly"]).toEqual({ used: 0, limit: 100 })
    expect(e.quota["web_text_translate_token_monthly"]).toEqual({ used: 0, limit: 0 })
    expect(e.quota["web_pdf_translate_monthly"]).toEqual({ used: 0, limit: 10 })
  })

  it("free tier: quota used reflects quota_period rows", async () => {
    const quotaRows: QuotaPeriodRow[] = [
      { userId: "u1", bucket: "web_text_translate_monthly", periodKey: currentPk, used: 42, updatedAt: Date.now() },
      { userId: "u1", bucket: "web_pdf_translate_monthly", periodKey: currentPk, used: 3, updatedAt: Date.now() },
    ]
    const e = await loadEntitlements(makeDb([], quotaRows), "u1", false)
    expect(e.quota["web_text_translate_monthly"]).toEqual({ used: 42, limit: 100 })
    expect(e.quota["web_pdf_translate_monthly"]).toEqual({ used: 3, limit: 10 })
    // token bucket had no row → used = 0
    expect(e.quota["web_text_translate_token_monthly"]).toEqual({ used: 0, limit: 0 })
  })

  it("pro tier: unlimited buckets use UNLIMITED_SENTINEL as limit", async () => {
    const e = await loadEntitlements(makeDb([{
      userId: "u1",
      tier: "pro",
      features: JSON.stringify([]),
      expiresAt: PRO_EXPIRES_MS,
      graceUntil: null,
      billingProvider: null,
    }]), "u1", false)
    // Pro has null limit for web_text_translate_monthly → UNLIMITED_SENTINEL
    expect(e.quota["web_text_translate_monthly"]?.limit).toBe(Number.MAX_SAFE_INTEGER)
    // Pro has limit=2_000_000 for token bucket
    expect(e.quota["web_text_translate_token_monthly"]?.limit).toBe(2_000_000)
    // Pro has limit=500 for PDF
    expect(e.quota["web_pdf_translate_monthly"]?.limit).toBe(500)
  })
})
