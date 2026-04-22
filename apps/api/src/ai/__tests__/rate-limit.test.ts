import { beforeEach, describe, expect, it, vi } from "vitest"
import { checkRateLimit, RATE_LIMIT_PER_MINUTE } from "../rate-limit"

function makeDb(initialCount: number) {
  const inserts: unknown[] = []
  return {
    inserts,
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn(async () => ({ n: initialCount })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (row: unknown) => {
        inserts.push(row)
      }),
    })),
  }
}

describe("checkRateLimit", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("allows when under limit and inserts a marker row", async () => {
    const db = makeDb(5)
    const ok = await checkRateLimit(db as any, "u1")
    expect(ok).toBe(true)
    expect(db.inserts).toHaveLength(1)
    expect((db.inserts[0] as any).bucket).toBe("ai_rate_limit")
  })

  it("blocks exactly at the limit and does NOT insert", async () => {
    const db = makeDb(RATE_LIMIT_PER_MINUTE)
    const ok = await checkRateLimit(db as any, "u1")
    expect(ok).toBe(false)
    expect(db.inserts).toHaveLength(0)
  })

  it("blocks above the limit", async () => {
    const db = makeDb(RATE_LIMIT_PER_MINUTE + 50)
    const ok = await checkRateLimit(db as any, "u1")
    expect(ok).toBe(false)
  })

  it("allows when count is exactly one below the limit", async () => {
    const db = makeDb(RATE_LIMIT_PER_MINUTE - 1)
    const ok = await checkRateLimit(db as any, "u1")
    expect(ok).toBe(true)
    expect(db.inserts).toHaveLength(1)
  })
})
