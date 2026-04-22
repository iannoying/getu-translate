import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearPdfTranslations,
  evictExpired,
  getCachedPage,
  putCachedPage,
  touchCachedPage,
} from "../pdf-translations"

interface Row {
  id: string
  fileHash: string
  pageIndex: number
  targetLang: string
  providerId: string
  paragraphs: Array<{ srcHash: string, translation: string }>
  createdAt: number
  lastAccessedAt: number
}

const rows = new Map<string, Row>()

const getMock = vi.fn(async (id: string) => rows.get(id))
const putMock = vi.fn(async (r: Row) => {
  rows.set(r.id, r)
})
const clearMock = vi.fn(async () => {
  rows.clear()
})
const transactionMock = vi.fn(
  async (_mode: string, _table: unknown, cb: () => Promise<unknown>) => cb(),
)

/**
 * Mock `db.pdfTranslations.where("lastAccessedAt").below(cutoff).delete()`
 * as a builder chain so the production code doesn't need to branch.
 */
function whereImpl(field: string) {
  return {
    below: (cutoff: number) => ({
      delete: async () => {
        if (field !== "lastAccessedAt")
          throw new Error(`unexpected field ${field}`)
        let n = 0
        for (const [id, row] of rows) {
          if (row.lastAccessedAt < cutoff) {
            rows.delete(id)
            n++
          }
        }
        return n
      },
    }),
  }
}

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    pdfTranslations: {
      get: (...args: unknown[]) => getMock(...(args as [string])),
      put: (...args: unknown[]) => putMock(...(args as [Row])),
      clear: (...args: unknown[]) => clearMock(...(args as [])),
      where: (field: string) => whereImpl(field),
    },
    transaction: (...args: unknown[]) =>
      transactionMock(...(args as Parameters<typeof transactionMock>)),
  },
}))

const SAMPLE_PARAGRAPHS = [
  { srcHash: "aaa", translation: "你好" },
  { srcHash: "bbb", translation: "世界" },
]

function makeRow(overrides: Partial<Row> = {}): Omit<Row, "lastAccessedAt"> {
  return {
    id: "file1:0",
    fileHash: "file1",
    pageIndex: 0,
    targetLang: "zh-CN",
    providerId: "openai",
    paragraphs: SAMPLE_PARAGRAPHS,
    createdAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe("pdf-translations cache", () => {
  beforeEach(() => {
    rows.clear()
    getMock.mockClear()
    putMock.mockClear()
    clearMock.mockClear()
    transactionMock.mockClear()
  })

  it("put + get round-trip preserves paragraphs, fileHash and pageIndex", async () => {
    await putCachedPage(makeRow())
    const got = await getCachedPage("file1", 0, "zh-CN", "openai")
    expect(got).not.toBeNull()
    expect(got?.id).toBe("file1:0")
    expect(got?.fileHash).toBe("file1")
    expect(got?.pageIndex).toBe(0)
    expect(got?.paragraphs).toEqual(SAMPLE_PARAGRAPHS)
    expect(got?.lastAccessedAt).toBe(got?.createdAt)
  })

  it("cache miss returns null for an unknown key", async () => {
    const got = await getCachedPage("nope", 42, "zh-CN", "openai")
    expect(got).toBeNull()
  })

  it("different targetLang keys stay isolated (miss on lang mismatch)", async () => {
    await putCachedPage(makeRow({ targetLang: "zh-CN" }))
    const hit = await getCachedPage("file1", 0, "zh-CN", "openai")
    const miss = await getCachedPage("file1", 0, "ja", "openai")
    expect(hit).not.toBeNull()
    expect(miss).toBeNull()
  })

  it("different providerId keys stay isolated (miss on provider mismatch)", async () => {
    await putCachedPage(makeRow({ providerId: "openai" }))
    const hit = await getCachedPage("file1", 0, "zh-CN", "openai")
    const miss = await getCachedPage("file1", 0, "zh-CN", "anthropic")
    expect(hit).not.toBeNull()
    expect(miss).toBeNull()
  })

  it("evictExpired deletes rows older than the TTL and returns the count", async () => {
    const now = 10_000
    // stale: accessed at 1000, ttl 5000 → cutoff 5000, 1000 < 5000 → deleted
    rows.set("f:0", {
      ...makeRow({ id: "f:0", fileHash: "f", pageIndex: 0 }),
      lastAccessedAt: 1000,
    })
    // fresh: accessed at 8000 → 8000 > 5000 → kept
    rows.set("f:1", {
      ...makeRow({ id: "f:1", fileHash: "f", pageIndex: 1 }),
      lastAccessedAt: 8000,
    })
    const deleted = await evictExpired(5000, now)
    expect(deleted).toBe(1)
    expect(rows.has("f:0")).toBe(false)
    expect(rows.has("f:1")).toBe(true)
  })

  it("evictExpired preserves all rows when every lastAccessedAt is within the TTL", async () => {
    const now = 10_000
    rows.set("f:0", {
      ...makeRow({ id: "f:0" }),
      lastAccessedAt: 9000,
    })
    rows.set("f:1", {
      ...makeRow({ id: "f:1", pageIndex: 1 }),
      lastAccessedAt: 9500,
    })
    const deleted = await evictExpired(5000, now)
    expect(deleted).toBe(0)
    expect(rows.size).toBe(2)
  })

  it("touchCachedPage updates lastAccessedAt only (leaves createdAt alone)", async () => {
    await putCachedPage(makeRow({ createdAt: 1000 }))
    await touchCachedPage("file1", 0, 5000)
    const got = await getCachedPage("file1", 0, "zh-CN", "openai")
    expect(got?.createdAt).toBe(1000)
    expect(got?.lastAccessedAt).toBe(5000)
  })

  it("touchCachedPage is a no-op on a missing row", async () => {
    await expect(touchCachedPage("ghost", 7, 1234)).resolves.toBeUndefined()
    expect(rows.size).toBe(0)
  })

  it("clearPdfTranslations empties the table", async () => {
    await putCachedPage(makeRow())
    await clearPdfTranslations()
    expect(rows.size).toBe(0)
  })
})
