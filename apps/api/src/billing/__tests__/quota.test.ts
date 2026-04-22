import { describe, expect, it, vi } from "vitest"
import { consumeQuota } from "../quota"

const NOW = new Date("2026-04-22T15:03:00.000Z")
const USER_ID = "user-1"
const REQUEST_ID = "01929b2e-test-7c9e-9f3a-8b4c5d6e7f80"

/**
 * Build a minimal fake drizzle-like DB.
 *
 * `rows` maps table symbol → row or undefined.
 * The fake supports the query pattern used by consumeQuota:
 *   db.select().from(table).where(...).get()
 *   db.insert(table).values(...) — returns a chainable stub
 *   db.insert(table).values(...).onConflictDoUpdate(...) — chainable stub
 *   db.batch([...]) — vi.fn resolving to undefined
 */
function makeFakeDb(opts: {
  usageLogRow?: Record<string, unknown>
  quotaPeriodRow?: Record<string, unknown>
  userEntitlementRow?: Record<string, unknown>
}) {
  const batchFn = vi.fn(async () => undefined)

  // We track which table is being queried by cycling through calls in order.
  // consumeQuota always calls in a predictable order so we key by (from) table symbol.
  // Using a simple approach: per-table canned row.

  function selectFrom(table: unknown) {
    // Identify table by comparing to known schema references
    const row =
      table === "usageLog"
        ? opts.usageLogRow
        : table === "quotaPeriod"
          ? opts.quotaPeriodRow
          : table === "userEntitlements"
            ? opts.userEntitlementRow
            : undefined

    return {
      where: () => ({ get: async () => row }),
    }
  }

  const db = {
    select: () => ({
      from: (table: unknown) => selectFrom(table),
    }),
    insert: (_table: unknown) => ({
      values: (_vals: unknown) => ({
        onConflictDoUpdate: (_opts: unknown) => "insertStmt",
        // for plain insert without onConflictDoUpdate
        toString: () => "insertStmt",
      }),
      // Expose as a statement directly too
    }),
    batch: batchFn,
  } as any

  return { db, batchFn }
}

// Build a fake DB where the table identity is resolved from the schema
// The real code does: db.select().from(schema.usageLog)...
// We need to intercept based on which schema object is passed.
// Let's use a smarter fake: track call order.
function makeFakeDbByOrder(opts: {
  // selects returned in call order (0-indexed)
  selectReturns: Array<Record<string, unknown> | undefined>
}) {
  const batchFn = vi.fn(async () => undefined)
  let callIdx = 0

  const db = {
    select: () => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          get: async () => {
            const row = opts.selectReturns[callIdx++]
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

  return { db, batchFn }
}

describe("consumeQuota", () => {
  describe("happy path — Pro ai_translate_monthly", () => {
    it("returns remaining and reset_at, calls db.batch once", async () => {
      // selectReturns order in consumeQuota (no existing row):
      //   0: usageLog.get() → undefined (no duplicate)
      //   1: userEntitlements.get() → pro row
      //   2: quotaPeriod.get() → undefined (first use)
      const { db, batchFn } = makeFakeDbByOrder({
        selectReturns: [
          undefined, // usageLog — no existing row
          { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" }, // userEntitlements
          undefined, // quotaPeriod — no prior period row
        ],
      })

      const result = await consumeQuota(db, USER_ID, "ai_translate_monthly", 100, REQUEST_ID, NOW)

      expect(result.bucket).toBe("ai_translate_monthly")
      expect(result.remaining).toBe(99_900) // 100_000 - (0 + 100)
      expect(result.reset_at).toBe("2026-05-01T00:00:00.000Z")
      expect(batchFn).toHaveBeenCalledTimes(1)
    })

    it("accounts for existing period usage", async () => {
      const { db, batchFn } = makeFakeDbByOrder({
        selectReturns: [
          undefined, // usageLog — no duplicate
          { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
          { used: 50_000, bucket: "ai_translate_monthly", periodKey: "2026-04" },
        ],
      })

      const result = await consumeQuota(db, USER_ID, "ai_translate_monthly", 1_000, REQUEST_ID, NOW)

      expect(result.remaining).toBe(49_000) // 100_000 - (50_000 + 1_000)
      expect(batchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe("QUOTA_EXCEEDED", () => {
    it("throws QUOTA_EXCEEDED when amount would exceed limit", async () => {
      const { db, batchFn } = makeFakeDbByOrder({
        selectReturns: [
          undefined,
          { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
          { used: 99_999, bucket: "ai_translate_monthly", periodKey: "2026-04" },
        ],
      })

      await expect(
        consumeQuota(db, USER_ID, "ai_translate_monthly", 2, REQUEST_ID, NOW),
      ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" })

      expect(batchFn).not.toHaveBeenCalled()
    })
  })

  describe("FORBIDDEN — free tier on ai_translate_monthly", () => {
    it("throws FORBIDDEN before capacity check", async () => {
      const { db, batchFn } = makeFakeDbByOrder({
        selectReturns: [
          undefined, // usageLog — no duplicate
          undefined, // userEntitlements — no row → defaults to free
        ],
      })

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
      const { db, batchFn } = makeFakeDbByOrder({
        selectReturns: [
          { id: "prev-id", userId: USER_ID, requestId: REQUEST_ID }, // usageLog existing
          { used: 100, bucket: "ai_translate_monthly", periodKey: "2026-04" }, // quotaPeriod
          { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" }, // userEntitlements
        ],
      })

      const result = await consumeQuota(db, USER_ID, "ai_translate_monthly", 100, REQUEST_ID, NOW)

      expect(result.remaining).toBe(99_900) // max(0, 100_000 - 100)
      expect(result.reset_at).toBe("2026-05-01T00:00:00.000Z")
      // Critical: no db.batch call — no double-charge
      expect(batchFn).not.toHaveBeenCalled()
    })
  })

  describe("daily bucket", () => {
    it("returns daily reset_at for input_translate_daily", async () => {
      const { db } = makeFakeDbByOrder({
        selectReturns: [
          undefined, // usageLog
          { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
          undefined, // quotaPeriod
        ],
      })

      const result = await consumeQuota(db, USER_ID, "input_translate_daily", 5, REQUEST_ID, NOW)

      expect(result.bucket).toBe("input_translate_daily")
      expect(result.remaining).toBeNull() // pro → null (unlimited)
      expect(result.reset_at).toBe("2026-04-23T00:00:00.000Z")
    })
  })

  describe("lifetime bucket — vocab_count", () => {
    it("returns null reset_at for vocab_count", async () => {
      const { db } = makeFakeDbByOrder({
        selectReturns: [
          undefined,
          { tier: "pro", expiresAt: new Date("2099-01-01"), features: "[]" },
          undefined,
        ],
      })

      const result = await consumeQuota(db, USER_ID, "vocab_count", 1, REQUEST_ID, NOW)

      expect(result.bucket).toBe("vocab_count")
      expect(result.remaining).toBeNull() // pro vocab → unlimited
      expect(result.reset_at).toBeNull()
    })
  })

  describe("free tier daily bucket", () => {
    it("returns remaining within free limit for input_translate_daily", async () => {
      const { db, batchFn } = makeFakeDbByOrder({
        selectReturns: [
          undefined,
          undefined, // userEntitlements → defaults to free
          undefined, // quotaPeriod → first use
        ],
      })

      const result = await consumeQuota(db, USER_ID, "input_translate_daily", 10, "req-free-1", NOW)

      expect(result.bucket).toBe("input_translate_daily")
      expect(result.remaining).toBe(40) // 50 - 10
      expect(batchFn).toHaveBeenCalledTimes(1)
    })

    it("throws QUOTA_EXCEEDED when free daily limit is hit", async () => {
      const { db, batchFn } = makeFakeDbByOrder({
        selectReturns: [
          undefined,
          undefined, // free tier
          { used: 45, bucket: "input_translate_daily", periodKey: "2026-04-22" },
        ],
      })

      await expect(
        consumeQuota(db, USER_ID, "input_translate_daily", 10, "req-free-2", NOW),
      ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" })

      expect(batchFn).not.toHaveBeenCalled()
    })
  })
})
