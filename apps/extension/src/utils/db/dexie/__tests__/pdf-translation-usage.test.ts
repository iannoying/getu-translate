import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearPdfPageUsage,
  getPdfPageUsage,
  incrementPdfPageUsage,
  pdfPageUsageDateKey,
} from "../pdf-translation-usage"

interface Row { dateKey: string, count: number, updatedAt: Date }

const rows = new Map<string, Row>()

const getMock = vi.fn(async (key: string) => rows.get(key))
const putMock = vi.fn(async (r: Row) => {
  rows.set(r.dateKey, r)
})
const clearMock = vi.fn(async () => {
  rows.clear()
})
// Serialize transaction bodies so the parallel-increment test actually
// verifies the rw transaction protects the get→put sequence. Dexie's real
// rw transactions serialize on a per-table lock, so this mirrors behavior.
let txChain: Promise<unknown> = Promise.resolve()
const transactionMock = vi.fn(
  (_mode: string, _table: unknown, cb: () => Promise<unknown>) => {
    const next = txChain.then(() => cb())
    // Swallow errors on the chain so one failure doesn't stick.
    txChain = next.catch(() => undefined)
    return next
  },
)

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    pdfTranslationUsage: {
      get: (...args: unknown[]) => getMock(...(args as [string])),
      put: (...args: unknown[]) => putMock(...(args as [Row])),
      clear: (...args: unknown[]) => clearMock(...(args as [])),
    },
    transaction: (...args: unknown[]) =>
      transactionMock(...(args as Parameters<typeof transactionMock>)),
  },
}))

describe("pdfPageUsageDateKey", () => {
  it("formats a date as local YYYY-MM-DD with zero-padding", () => {
    expect(pdfPageUsageDateKey(new Date(2026, 3, 21, 10, 0, 0))).toBe("2026-04-21")
    expect(pdfPageUsageDateKey(new Date(2026, 0, 1, 23, 59, 59))).toBe("2026-01-01")
    expect(pdfPageUsageDateKey(new Date(2026, 11, 31, 0, 0, 0))).toBe("2026-12-31")
  })
})

describe("incrementPdfPageUsage", () => {
  beforeEach(() => {
    rows.clear()
    getMock.mockClear()
    putMock.mockClear()
    clearMock.mockClear()
    transactionMock.mockClear()
    txChain = Promise.resolve()
  })

  it("returns 1 for the first call of the day and persists count=1", async () => {
    const out = await incrementPdfPageUsage(new Date(2026, 3, 21, 9, 0))
    expect(out).toBe(1)
    expect(rows.get("2026-04-21")?.count).toBe(1)
  })

  it("monotonically increments within the same day", async () => {
    const now = new Date(2026, 3, 22, 10, 0, 0)
    expect(await incrementPdfPageUsage(now)).toBe(1)
    expect(await incrementPdfPageUsage(now)).toBe(2)
    expect(await incrementPdfPageUsage(now)).toBe(3)
  })

  it("keeps separate counters per local calendar day", async () => {
    await incrementPdfPageUsage(new Date(2026, 3, 20, 23, 59))
    await incrementPdfPageUsage(new Date(2026, 3, 21, 0, 1))
    expect(rows.get("2026-04-20")?.count).toBe(1)
    expect(rows.get("2026-04-21")?.count).toBe(1)
  })

  it("runs inside a rw transaction scoped to the usage table", async () => {
    await incrementPdfPageUsage(new Date(2026, 3, 21, 9, 0))
    expect(transactionMock).toHaveBeenCalledWith(
      "rw",
      expect.anything(),
      expect.any(Function),
    )
  })

  it("100 parallel increments settle on count === 100 (transaction serializes)", async () => {
    const now = new Date(2026, 3, 21, 9, 0)
    await Promise.all(
      Array.from({ length: 100 }, () => incrementPdfPageUsage(now)),
    )
    expect(rows.get("2026-04-21")?.count).toBe(100)
  })
})

describe("getPdfPageUsage", () => {
  beforeEach(() => {
    rows.clear()
    getMock.mockClear()
  })

  it("returns 0 when no row exists for today", async () => {
    await expect(getPdfPageUsage(new Date(2030, 0, 1))).resolves.toBe(0)
  })

  it("returns the stored count when a row exists", async () => {
    rows.set("2026-04-21", {
      dateKey: "2026-04-21",
      count: 9,
      updatedAt: new Date(),
    })
    await expect(
      getPdfPageUsage(new Date(2026, 3, 21, 15, 0)),
    ).resolves.toBe(9)
  })
})

describe("clearPdfPageUsage", () => {
  it("drops every row", async () => {
    rows.set("2026-04-21", {
      dateKey: "2026-04-21",
      count: 3,
      updatedAt: new Date(),
    })
    await clearPdfPageUsage()
    expect(rows.size).toBe(0)
  })
})
