import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearInputTranslationUsage,
  formatUsageDateKey,
  getInputTranslationUsage,
  incrementInputTranslationUsage,
} from "../input-translation-usage"

interface Row { dateKey: string, count: number, updatedAt: Date }

const rows = new Map<string, Row>()

const getMock = vi.fn(async (key: string) => rows.get(key))
const putMock = vi.fn(async (r: Row) => {
  rows.set(r.dateKey, r)
})
const clearMock = vi.fn(async () => {
  rows.clear()
})
const transactionMock = vi.fn(async (_mode: string, _table: unknown, cb: () => Promise<unknown>) => cb())

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    inputTranslationUsage: {
      get: (...args: unknown[]) => getMock(...(args as [string])),
      put: (...args: unknown[]) => putMock(...(args as [Row])),
      clear: (...args: unknown[]) => clearMock(...(args as [])),
    },
    transaction: (...args: unknown[]) => transactionMock(...(args as Parameters<typeof transactionMock>)),
  },
}))

describe("formatUsageDateKey", () => {
  it("formats a date as local YYYY-MM-DD with zero-padding", () => {
    expect(formatUsageDateKey(new Date(2026, 3, 21, 10, 0, 0))).toBe("2026-04-21")
    expect(formatUsageDateKey(new Date(2026, 0, 1, 23, 59, 59))).toBe("2026-01-01")
    expect(formatUsageDateKey(new Date(2026, 11, 31, 0, 0, 0))).toBe("2026-12-31")
  })
})

describe("incrementInputTranslationUsage", () => {
  beforeEach(() => {
    rows.clear()
    getMock.mockClear()
    putMock.mockClear()
    clearMock.mockClear()
    transactionMock.mockClear()
  })

  it("returns 1 for the first call of the day", async () => {
    const out = await incrementInputTranslationUsage(new Date(2026, 3, 21, 9, 0))
    expect(out).toBe(1)
    expect(rows.get("2026-04-21")?.count).toBe(1)
  })

  it("monotonically increments within the same day", async () => {
    await incrementInputTranslationUsage(new Date(2026, 3, 21, 9, 0))
    await incrementInputTranslationUsage(new Date(2026, 3, 21, 9, 30))
    const out = await incrementInputTranslationUsage(new Date(2026, 3, 21, 10, 0))
    expect(out).toBe(3)
  })

  it("keeps separate counters per local calendar day", async () => {
    await incrementInputTranslationUsage(new Date(2026, 3, 20, 23, 59))
    await incrementInputTranslationUsage(new Date(2026, 3, 21, 0, 1))
    expect(rows.get("2026-04-20")?.count).toBe(1)
    expect(rows.get("2026-04-21")?.count).toBe(1)
  })

  it("runs inside a rw transaction scoped to the usage table", async () => {
    await incrementInputTranslationUsage(new Date(2026, 3, 21, 9, 0))
    expect(transactionMock).toHaveBeenCalledWith("rw", expect.anything(), expect.any(Function))
  })
})

describe("getInputTranslationUsage", () => {
  beforeEach(() => {
    rows.clear()
    getMock.mockClear()
  })

  it("returns 0 when no row exists for today", async () => {
    await expect(getInputTranslationUsage(new Date(2030, 0, 1))).resolves.toBe(0)
  })

  it("returns the stored count when a row exists", async () => {
    rows.set("2026-04-21", { dateKey: "2026-04-21", count: 7, updatedAt: new Date() })
    await expect(getInputTranslationUsage(new Date(2026, 3, 21, 15, 0))).resolves.toBe(7)
  })
})

describe("clearInputTranslationUsage", () => {
  it("drops every row", async () => {
    rows.set("2026-04-21", { dateKey: "2026-04-21", count: 3, updatedAt: new Date() })
    await clearInputTranslationUsage()
    expect(rows.size).toBe(0)
  })
})
