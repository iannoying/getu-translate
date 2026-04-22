import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearPdfTranslations,
  evictExpired,
  evictStaleConfigRows,
  getCachedPage,
  putCachedPage,
  touchCachedPage,
} from "../pdf-translations"

interface BBox { x: number, y: number, width: number, height: number }
interface Row {
  id: string
  fileHash: string
  pageIndex: number
  targetLang: string
  providerId: string
  paragraphs: Array<{ srcHash: string, translation: string, boundingBox?: BBox }>
  createdAt: number
  lastAccessedAt: number
}

const rows = new Map<string, Row>()

const getMock = vi.fn(async (id: string) => rows.get(id))
const putMock = vi.fn(async (r: Row) => {
  rows.set(r.id, r)
})
const bulkDeleteMock = vi.fn(async (ids: string[]) => {
  for (const id of ids)
    rows.delete(id)
})
const clearMock = vi.fn(async () => {
  rows.clear()
})
const transactionMock = vi.fn(
  async (_mode: string, _table: unknown, cb: () => Promise<unknown>) => cb(),
)

/**
 * Mock `db.pdfTranslations.where(field)` as a builder chain so production
 * code doesn't need to branch:
 *   - `where("lastAccessedAt").below(cutoff).delete()` → evictExpired
 *   - `where("fileHash").equals(h).and(pred).toArray()` → evictStaleConfigRows
 */
function whereImpl(field: string) {
  return {
    below: (cutoff: number) => ({
      delete: async () => {
        if (field !== "lastAccessedAt")
          throw new Error(`unexpected field ${field} for below()`)
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
    equals: (value: unknown) => ({
      and: (pred: (row: Row) => boolean) => ({
        toArray: async () => {
          if (field !== "fileHash")
            throw new Error(`unexpected field ${field} for equals()`)
          const out: Row[] = []
          for (const row of rows.values()) {
            if (row.fileHash === value && pred(row))
              out.push(row)
          }
          return out
        },
      }),
    }),
  }
}

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    pdfTranslations: {
      get: (...args: unknown[]) => getMock(...(args as [string])),
      put: (...args: unknown[]) => putMock(...(args as [Row])),
      bulkDelete: (...args: unknown[]) => bulkDeleteMock(...(args as [string[]])),
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
    bulkDeleteMock.mockClear()
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

  it("put + get round-trip preserves optional boundingBox when present (v9 schema)", async () => {
    const paragraphsWithBbox = [
      {
        srcHash: "aaa",
        translation: "你好",
        boundingBox: { x: 72, y: 600, width: 450, height: 14 },
      },
      {
        srcHash: "bbb",
        translation: "世界",
        boundingBox: { x: 72, y: 580, width: 450, height: 14 },
      },
    ]
    await putCachedPage(makeRow({ paragraphs: paragraphsWithBbox }))
    const got = await getCachedPage("file1", 0, "zh-CN", "openai")
    expect(got).not.toBeNull()
    expect(got?.paragraphs).toEqual(paragraphsWithBbox)
    expect(got?.paragraphs[0].boundingBox).toEqual({
      x: 72,
      y: 600,
      width: 450,
      height: 14,
    })
  })

  it("put + get round-trip leaves boundingBox absent for legacy-shaped rows", async () => {
    // Simulates a v8-era row: paragraphs lack the boundingBox field. The
    // cache layer is transparent — whatever shape the caller puts, it gets
    // back verbatim. No migration runs on read.
    await putCachedPage(makeRow())
    const got = await getCachedPage("file1", 0, "zh-CN", "openai")
    expect(got).not.toBeNull()
    for (const para of got!.paragraphs) {
      expect(para.boundingBox).toBeUndefined()
    }
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

  it("preserves row with lastAccessedAt === cutoff (strict > comparison)", async () => {
    // createdAt=1000 → lastAccessedAt=1000 (putCachedPage stamps them equal).
    // ttl=5000, now=6000 → cutoff = 6000 - 5000 = 1000; row at 1000 is EQUAL to cutoff,
    // and Dexie's `.below(cutoff)` uses strict <, so the row must survive.
    await putCachedPage({
      id: "file-boundary:0",
      fileHash: "file-boundary",
      pageIndex: 0,
      targetLang: "en",
      providerId: "google-translate",
      paragraphs: [],
      createdAt: 1000,
    })
    const deleted = await evictExpired(5000, 6000)
    expect(deleted).toBe(0)
    const row = await getCachedPage("file-boundary", 0, "en", "google-translate")
    expect(row).not.toBeNull()
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

  describe("evictStaleConfigRows", () => {
    it("keeps rows whose (targetLang, providerId) matches the current config", async () => {
      await putCachedPage(makeRow({
        id: "file1:0",
        pageIndex: 0,
        targetLang: "zh-CN",
        providerId: "openai",
      }))
      await putCachedPage(makeRow({
        id: "file1:1",
        pageIndex: 1,
        targetLang: "zh-CN",
        providerId: "openai",
      }))
      const deleted = await evictStaleConfigRows("file1", "zh-CN", "openai")
      expect(deleted).toBe(0)
      expect(rows.size).toBe(2)
    })

    it("deletes rows with a stale targetLang", async () => {
      await putCachedPage(makeRow({
        id: "file1:0",
        targetLang: "ja",
        providerId: "openai",
      }))
      await putCachedPage(makeRow({
        id: "file1:1",
        pageIndex: 1,
        targetLang: "zh-CN",
        providerId: "openai",
      }))
      const deleted = await evictStaleConfigRows("file1", "zh-CN", "openai")
      expect(deleted).toBe(1)
      expect(rows.has("file1:0")).toBe(false)
      expect(rows.has("file1:1")).toBe(true)
    })

    it("deletes rows with a stale providerId", async () => {
      await putCachedPage(makeRow({
        id: "file1:0",
        targetLang: "zh-CN",
        providerId: "anthropic",
      }))
      await putCachedPage(makeRow({
        id: "file1:1",
        pageIndex: 1,
        targetLang: "zh-CN",
        providerId: "openai",
      }))
      const deleted = await evictStaleConfigRows("file1", "zh-CN", "openai")
      expect(deleted).toBe(1)
      expect(rows.has("file1:0")).toBe(false)
      expect(rows.has("file1:1")).toBe(true)
    })

    it("leaves unrelated fileHash rows untouched even when their config differs", async () => {
      // Row for file1 with stale config: should be deleted.
      await putCachedPage(makeRow({
        id: "file1:0",
        fileHash: "file1",
        targetLang: "ja",
        providerId: "openai",
      }))
      // Row for file2 with a *different* config: must survive — the sweep
      // is scoped to one fileHash at a time.
      await putCachedPage(makeRow({
        id: "file2:0",
        fileHash: "file2",
        targetLang: "ja",
        providerId: "openai",
      }))
      const deleted = await evictStaleConfigRows("file1", "zh-CN", "openai")
      expect(deleted).toBe(1)
      expect(rows.has("file1:0")).toBe(false)
      expect(rows.has("file2:0")).toBe(true)
    })

    it("returns 0 and skips the bulkDelete write when nothing is stale", async () => {
      await putCachedPage(makeRow({
        targetLang: "zh-CN",
        providerId: "openai",
      }))
      const deleted = await evictStaleConfigRows("file1", "zh-CN", "openai")
      expect(deleted).toBe(0)
      expect(bulkDeleteMock).not.toHaveBeenCalled()
    })
  })
})
