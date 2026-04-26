import { describe, expect, it, vi } from "vitest"
import { assertCanConsumeQuotaBucket, consumeQuota } from "../quota"

const NOW = new Date("2026-04-22T15:03:00.000Z")
const USER_ID = "user-1"
const REQUEST_ID = "01929b2e-test-7c9e-9f3a-8b4c5d6e7f80"

/**
 * Build a minimal fake drizzle-like DB.
 * `selectReturns` is a list of rows returned in call order (0-indexed).
 * The fake supports the query pattern used by consumeQuota:
 *   db.select().from(table).where(...).get()
 *   db.insert(table).values(...).onConflictDoUpdate(...) — chainable stub
 *   db.batch([...]) — vi.fn resolving to undefined
 */
function makeFakeDbByOrder(selectReturns: Array<Record<string, unknown> | undefined>) {
  const batchFn = vi.fn(async () => undefined)
  let callIdx = 0

  const db = {
    select: () => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          get: async () => {
            const row = selectReturns[callIdx++]
            return row
          },
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (_vals: unknown) => ({
        onConflictDoUpdate: (_opts: unknown) => "insertStmt",
      }),
    }),
    batch: batchFn,
  } as any

  // Expose batch directly so tests can assert on db.batch
  db.batch = batchFn

  return { db, batchFn }
}

describe("consumeQuota", () => {
  describe("happy path — Pro ai_translate_monthly", () => {
    it("returns remaining and reset_at, calls db.batch once", async () => {
      // selectReturns order in consumeQuota (no existing row):
      //   0: usageLog.get() → undefined (no duplicate)
      //   1: userEntitlements.get() → pro row
      //   2: quotaPeriod.get() → undefined (first use)
      const { db, batchFn } = makeFakeDbByOrder([
        undefined, // usageLog — no existing row
        { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" }, // userEntitlements
        undefined, // quotaPeriod — no prior period row
      ])

      const result = await consumeQuota(db, USER_ID, "ai_translate_monthly", 100, REQUEST_ID, NOW)

      expect(result.bucket).toBe("ai_translate_monthly")
      expect(result.remaining).toBe(99_900) // 100_000 - (0 + 100)
      expect(result.reset_at).toBe("2026-05-01T00:00:00.000Z")
      expect(batchFn).toHaveBeenCalledTimes(1)
    })

    it("accounts for existing period usage", async () => {
      const { db, batchFn } = makeFakeDbByOrder([
        undefined, // usageLog — no duplicate
        { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
        { used: 50_000, bucket: "ai_translate_monthly", periodKey: "2026-04" },
      ])

      const result = await consumeQuota(db, USER_ID, "ai_translate_monthly", 1_000, REQUEST_ID, NOW)

      expect(result.remaining).toBe(49_000) // 100_000 - (50_000 + 1_000)
      expect(batchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe("QUOTA_EXCEEDED", () => {
    it("throws QUOTA_EXCEEDED when amount would exceed limit", async () => {
      const { db, batchFn } = makeFakeDbByOrder([
        undefined,
        { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
        { used: 99_999, bucket: "ai_translate_monthly", periodKey: "2026-04" },
      ])

      await expect(
        consumeQuota(db, USER_ID, "ai_translate_monthly", 2, REQUEST_ID, NOW),
      ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" })

      expect(batchFn).not.toHaveBeenCalled()
    })
  })

  describe("FORBIDDEN — free tier on ai_translate_monthly", () => {
    it("throws FORBIDDEN before capacity check", async () => {
      const { db, batchFn } = makeFakeDbByOrder([
        undefined, // usageLog — no duplicate
        undefined, // userEntitlements — no row → defaults to free
      ])

      await expect(
        consumeQuota(db, USER_ID, "ai_translate_monthly", 1, REQUEST_ID, NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })

      expect(batchFn).not.toHaveBeenCalled()
    })
  })

  describe("idempotent replay", () => {
    it("returns same result without calling db.batch when request_id seen", async () => {
      // Idempotency branch selectReturns order:
      //   0: usageLog.get() → existing row
      //   1: quotaPeriod.get()
      //   2: userEntitlements.get()
      const { db, batchFn } = makeFakeDbByOrder([
        { id: "prev-id", userId: USER_ID, requestId: REQUEST_ID }, // usageLog existing
        { used: 100, bucket: "ai_translate_monthly", periodKey: "2026-04" }, // quotaPeriod
        { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" }, // userEntitlements
      ])

      const result = await consumeQuota(db, USER_ID, "ai_translate_monthly", 100, REQUEST_ID, NOW)

      expect(result.remaining).toBe(99_900) // max(0, 100_000 - 100)
      expect(result.reset_at).toBe("2026-05-01T00:00:00.000Z")
      // Critical: no db.batch call — no double-charge
      expect(batchFn).not.toHaveBeenCalled()
    })
  })

  describe("daily bucket", () => {
    it("returns daily reset_at for input_translate_daily", async () => {
      const { db } = makeFakeDbByOrder([
        undefined, // usageLog
        { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
        undefined, // quotaPeriod
      ])

      const result = await consumeQuota(db, USER_ID, "input_translate_daily", 5, REQUEST_ID, NOW)

      expect(result.bucket).toBe("input_translate_daily")
      expect(result.remaining).toBeNull() // pro → null (unlimited)
      expect(result.reset_at).toBe("2026-04-23T00:00:00.000Z")
    })
  })

  describe("lifetime bucket — vocab_count", () => {
    it("returns null reset_at for vocab_count", async () => {
      const { db } = makeFakeDbByOrder([
        undefined,
        { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
        undefined,
      ])

      const result = await consumeQuota(db, USER_ID, "vocab_count", 1, REQUEST_ID, NOW)

      expect(result.bucket).toBe("vocab_count")
      expect(result.remaining).toBeNull() // pro vocab → unlimited
      expect(result.reset_at).toBeNull()
    })
  })

  describe("free tier daily bucket", () => {
    it("returns remaining within free limit for input_translate_daily", async () => {
      const { db, batchFn } = makeFakeDbByOrder([
        undefined,
        undefined, // userEntitlements → defaults to free
        undefined, // quotaPeriod → first use
      ])

      const result = await consumeQuota(db, USER_ID, "input_translate_daily", 10, "req-free-1", NOW)

      expect(result.bucket).toBe("input_translate_daily")
      expect(result.remaining).toBe(40) // 50 - 10
      expect(batchFn).toHaveBeenCalledTimes(1)
    })

    it("throws QUOTA_EXCEEDED when free daily limit is hit", async () => {
      const { db, batchFn } = makeFakeDbByOrder([
        undefined,
        undefined, // free tier
        { used: 45, bucket: "input_translate_daily", periodKey: "2026-04-22" },
      ])

      await expect(
        consumeQuota(db, USER_ID, "input_translate_daily", 10, "req-free-2", NOW),
      ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" })

      expect(batchFn).not.toHaveBeenCalled()
    })
  })

  describe("enterprise tier", () => {
    it("enterprise tier with expiresAt=null is not downgraded", async () => {
      const { db, batchFn } = makeFakeDbByOrder([
        undefined,                                   // idempotency miss
        { tier: "enterprise", expiresAt: null },     // entitlements — no expiry
        undefined,                                   // quotaPeriod row missing
      ])

      const res = await consumeQuota(db, USER_ID, "ai_translate_monthly", 5_000, "req-ent", NOW)

      expect(res.remaining).toBeNull() // enterprise ai_translate_monthly = unlimited
      expect(batchFn).toHaveBeenCalledTimes(1)
    })
  })
})

describe("assertCanConsumeQuotaBucket", () => {
  it("throws FORBIDDEN for a free-tier zero-limit bucket without writing usage", async () => {
    const { db, batchFn } = makeFakeDbByOrder([
      undefined, // userEntitlements — no row → defaults to free
    ])

    await expect(
      assertCanConsumeQuotaBucket(db, USER_ID, "web_text_translate_token_monthly", NOW),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(batchFn).not.toHaveBeenCalled()
  })

  it("allows a pro-tier bucket preflight without consuming quota", async () => {
    const { db, batchFn } = makeFakeDbByOrder([
      { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
      undefined, // quotaPeriod — no prior period row
    ])

    await expect(
      assertCanConsumeQuotaBucket(db, USER_ID, "web_text_translate_token_monthly", NOW),
    ).resolves.toBeUndefined()

    expect(batchFn).not.toHaveBeenCalled()
  })

  it("throws QUOTA_EXCEEDED for a finite bucket whose current period is exhausted without writing usage", async () => {
    const { db, batchFn } = makeFakeDbByOrder([
      { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
      { used: 2_000_000, bucket: "web_text_translate_token_monthly", periodKey: "2026-04" },
    ])

    await expect(
      assertCanConsumeQuotaBucket(db, USER_ID, "web_text_translate_token_monthly", NOW),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" })

    expect(batchFn).not.toHaveBeenCalled()
  })
})
