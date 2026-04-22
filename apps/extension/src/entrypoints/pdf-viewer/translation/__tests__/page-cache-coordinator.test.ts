import type { Paragraph } from "../../paragraph/types"
import type { SegmentStatus } from "../atoms"
import type { PdfTranslationRow } from "@/utils/db/dexie/pdf-translations"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Sha256Hex } from "@/utils/hash"
import { PageCacheCoordinator } from "../page-cache-coordinator"

function makeParagraph(pageIndex: number, paragraphIndex: number, text: string): Paragraph {
  return {
    items: [],
    text,
    // Give each paragraph a distinct bbox so tests can assert the coordinator
    // propagates per-paragraph geometry into the cache write (M3 inline
    // export Task 2). `y` decreases as paragraphIndex grows to mimic top-to-
    // bottom flow in PDF coords (y grows upward).
    boundingBox: {
      x: 72,
      y: 700 - paragraphIndex * 20,
      width: 450,
      height: 14,
    },
    fontSize: 12,
    key: `p-${pageIndex}-${paragraphIndex}`,
  }
}

/** Flush microtasks so fire-and-forget cache writes settle before assertions. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

interface Harness {
  coordinator: PageCacheCoordinator
  setSegmentStatus: ReturnType<typeof vi.fn>
  enqueueSegment: ReturnType<typeof vi.fn>
  getCachedPage: ReturnType<typeof vi.fn>
  putCachedPage: ReturnType<typeof vi.fn>
  touchCachedPage: ReturnType<typeof vi.fn>
  onPageSuccess: ReturnType<typeof vi.fn>
}

function makeHarness(overrides: {
  cached?: Map<string, PdfTranslationRow>
  now?: () => number
  fileHash?: string
} = {}): Harness {
  const cached = overrides.cached ?? new Map<string, PdfTranslationRow>()
  const setSegmentStatus = vi.fn<(pageIndex: number, paragraphIndex: number, status: SegmentStatus) => void>()
  const enqueueSegment = vi.fn<(fileHash: string, paragraph: Paragraph) => void>()
  const getCachedPage = vi.fn(
    async (fileHash: string, pageIndex: number, targetLang: string, providerId: string): Promise<PdfTranslationRow | null> => {
      const row = cached.get(`${fileHash}:${pageIndex}`)
      if (!row)
        return null
      if (row.targetLang !== targetLang || row.providerId !== providerId)
        return null
      return row
    },
  )
  const putCachedPage = vi.fn(async (row: Omit<PdfTranslationRow, "lastAccessedAt">) => {
    cached.set(row.id, { ...row, lastAccessedAt: row.createdAt })
  })
  const touchCachedPage = vi.fn(async (_fileHash: string, _pageIndex: number) => {})
  const onPageSuccess = vi.fn()

  const coordinator = new PageCacheCoordinator({
    fileHash: overrides.fileHash ?? "file1",
    targetLang: "zh-CN",
    providerId: "openai",
    setSegmentStatus,
    enqueueSegment,
    getCachedPage,
    putCachedPage,
    touchCachedPage,
    onPageSuccess,
    now: overrides.now ?? (() => 1_700_000_000_000),
  })

  return {
    coordinator,
    setSegmentStatus,
    enqueueSegment,
    getCachedPage,
    putCachedPage,
    touchCachedPage,
    onPageSuccess,
  }
}

describe("pageCacheCoordinator", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("cache hit: fans out done status to every paragraph without enqueueing", async () => {
    const cached = new Map<string, PdfTranslationRow>([
      [
        "file1:0",
        {
          id: "file1:0",
          fileHash: "file1",
          pageIndex: 0,
          targetLang: "zh-CN",
          providerId: "openai",
          paragraphs: [
            { srcHash: Sha256Hex("hello"), translation: "你好" },
            { srcHash: Sha256Hex("world"), translation: "世界" },
          ],
          createdAt: 1000,
          lastAccessedAt: 1000,
        },
      ],
    ])
    const h = makeHarness({ cached })
    const paragraphs = [makeParagraph(0, 0, "hello"), makeParagraph(0, 1, "world")]

    await h.coordinator.startPage(0, paragraphs)
    await flush()

    expect(h.getCachedPage).toHaveBeenCalledOnce()
    expect(h.enqueueSegment).not.toHaveBeenCalled()
    expect(h.setSegmentStatus).toHaveBeenCalledTimes(2)
    expect(h.setSegmentStatus).toHaveBeenNthCalledWith(
      1,
      0,
      0,
      { kind: "done", translation: "你好" },
    )
    expect(h.setSegmentStatus).toHaveBeenNthCalledWith(
      2,
      0,
      1,
      { kind: "done", translation: "世界" },
    )
    expect(h.touchCachedPage).toHaveBeenCalledWith("file1", 0)
    // onPageSuccess fires only for fresh translations, not cache hits.
    expect(h.onPageSuccess).not.toHaveBeenCalled()
  })

  it("cache miss: enqueues every paragraph through the scheduler", async () => {
    const h = makeHarness()
    const paragraphs = [
      makeParagraph(0, 0, "alpha"),
      makeParagraph(0, 1, "beta"),
      makeParagraph(0, 2, "gamma"),
    ]

    await h.coordinator.startPage(0, paragraphs)
    await flush()

    expect(h.enqueueSegment).toHaveBeenCalledTimes(3)
    expect(h.enqueueSegment).toHaveBeenNthCalledWith(1, "file1", paragraphs[0])
    expect(h.enqueueSegment).toHaveBeenNthCalledWith(2, "file1", paragraphs[1])
    expect(h.enqueueSegment).toHaveBeenNthCalledWith(3, "file1", paragraphs[2])
    expect(h.setSegmentStatus).not.toHaveBeenCalled()
    expect(h.touchCachedPage).not.toHaveBeenCalled()
    expect(h.onPageSuccess).not.toHaveBeenCalled()
    expect(h.putCachedPage).not.toHaveBeenCalled()
  })

  it("writes cache row with srcHash + translations and fires onPageSuccess when all paragraphs complete", async () => {
    const h = makeHarness({ now: () => 42_000 })
    const paragraphs = [
      makeParagraph(0, 0, "alpha"),
      makeParagraph(0, 1, "beta"),
    ]

    await h.coordinator.startPage(0, paragraphs)
    h.coordinator.recordParagraphResult(0, 0, { kind: "translating" })
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "甲" })

    // One paragraph done — not yet written.
    expect(h.putCachedPage).not.toHaveBeenCalled()
    expect(h.onPageSuccess).not.toHaveBeenCalled()

    h.coordinator.recordParagraphResult(0, 1, { kind: "done", translation: "乙" })
    await flush()

    expect(h.putCachedPage).toHaveBeenCalledOnce()
    expect(h.putCachedPage).toHaveBeenCalledWith({
      id: "file1:0",
      fileHash: "file1",
      pageIndex: 0,
      targetLang: "zh-CN",
      providerId: "openai",
      paragraphs: [
        {
          srcHash: Sha256Hex("alpha"),
          translation: "甲",
          boundingBox: paragraphs[0].boundingBox,
        },
        {
          srcHash: Sha256Hex("beta"),
          translation: "乙",
          boundingBox: paragraphs[1].boundingBox,
        },
      ],
      createdAt: 42_000,
    })
    expect(h.onPageSuccess).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledWith(0)
  })

  it("propagates each paragraph's boundingBox into the cache row (M3 inline export)", async () => {
    // Captured at startPage from the fresh Paragraph[] and written verbatim
    // when every paragraph lands done. The exporter depends on this field
    // to draw translations under their source paragraph.
    const h = makeHarness({ now: () => 1 })
    const paragraphs = [
      makeParagraph(0, 0, "alpha"),
      makeParagraph(0, 1, "beta"),
      makeParagraph(0, 2, "gamma"),
    ]

    await h.coordinator.startPage(0, paragraphs)
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "α" })
    h.coordinator.recordParagraphResult(0, 1, { kind: "done", translation: "β" })
    h.coordinator.recordParagraphResult(0, 2, { kind: "done", translation: "γ" })
    await flush()

    expect(h.putCachedPage).toHaveBeenCalledOnce()
    const [row] = h.putCachedPage.mock.calls[0]
    expect(row.paragraphs).toHaveLength(3)
    for (let i = 0; i < 3; i++) {
      expect(row.paragraphs[i]).toHaveProperty("boundingBox")
      expect(row.paragraphs[i].boundingBox).toEqual(paragraphs[i].boundingBox)
    }
  })

  it("partial failure: does NOT write cache when any paragraph errors", async () => {
    const h = makeHarness()
    const paragraphs = [
      makeParagraph(0, 0, "alpha"),
      makeParagraph(0, 1, "beta"),
    ]

    await h.coordinator.startPage(0, paragraphs)
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "甲" })
    h.coordinator.recordParagraphResult(0, 1, { kind: "error", message: "boom" })
    await flush()

    expect(h.putCachedPage).not.toHaveBeenCalled()
    expect(h.onPageSuccess).not.toHaveBeenCalled()
  })

  it("two pages interleaved: each writes its own cache row independently", async () => {
    const h = makeHarness({ now: () => 100 })
    const page0 = [makeParagraph(0, 0, "a0"), makeParagraph(0, 1, "a1")]
    const page1 = [makeParagraph(1, 0, "b0"), makeParagraph(1, 1, "b1")]

    await h.coordinator.startPage(0, page0)
    await h.coordinator.startPage(1, page1)

    // Interleave completions across both pages.
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "a0-tr" })
    h.coordinator.recordParagraphResult(1, 1, { kind: "done", translation: "b1-tr" })
    h.coordinator.recordParagraphResult(1, 0, { kind: "done", translation: "b0-tr" })
    await flush()

    // Page 1 finished first (both paragraphs done).
    expect(h.putCachedPage).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledWith(1)

    // Finish page 0.
    h.coordinator.recordParagraphResult(0, 1, { kind: "done", translation: "a1-tr" })
    await flush()

    expect(h.putCachedPage).toHaveBeenCalledTimes(2)
    expect(h.onPageSuccess).toHaveBeenCalledTimes(2)
    expect(h.onPageSuccess).toHaveBeenNthCalledWith(2, 0)

    // Verify row content for page 0.
    const page0Write = h.putCachedPage.mock.calls.find(([row]) => row.pageIndex === 0)?.[0]
    expect(page0Write).toBeDefined()
    expect(page0Write!.paragraphs).toEqual([
      {
        srcHash: Sha256Hex("a0"),
        translation: "a0-tr",
        boundingBox: page0[0].boundingBox,
      },
      {
        srcHash: Sha256Hex("a1"),
        translation: "a1-tr",
        boundingBox: page0[1].boundingBox,
      },
    ])
  })

  it("idempotent: repeated done for the same paragraph counts once (no double-write)", async () => {
    const h = makeHarness()
    const paragraphs = [makeParagraph(0, 0, "only")]

    await h.coordinator.startPage(0, paragraphs)
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "唯一" })
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "唯一" })
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "唯一" })
    await flush()

    expect(h.putCachedPage).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledOnce()
  })

  it("retries: error then done still writes the cache once both paragraphs succeed", async () => {
    const h = makeHarness()
    const paragraphs = [
      makeParagraph(0, 0, "alpha"),
      makeParagraph(0, 1, "beta"),
    ]

    await h.coordinator.startPage(0, paragraphs)
    h.coordinator.recordParagraphResult(0, 0, { kind: "error", message: "flaky" })
    // Scheduler retries on re-enqueue; paragraph eventually succeeds.
    h.coordinator.recordParagraphResult(0, 0, { kind: "translating" })
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "甲" })
    h.coordinator.recordParagraphResult(0, 1, { kind: "done", translation: "乙" })
    await flush()

    expect(h.putCachedPage).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledWith(0)
  })

  it("cache lookup mismatch (wrong targetLang) falls back to enqueue path", async () => {
    const cached = new Map<string, PdfTranslationRow>([
      [
        "file1:0",
        {
          id: "file1:0",
          fileHash: "file1",
          pageIndex: 0,
          targetLang: "ja", // stored with different lang
          providerId: "openai",
          paragraphs: [
            { srcHash: Sha256Hex("hello"), translation: "こんにちは" },
          ],
          createdAt: 1000,
          lastAccessedAt: 1000,
        },
      ],
    ])
    const h = makeHarness({ cached })
    const paragraphs = [makeParagraph(0, 0, "hello")]

    await h.coordinator.startPage(0, paragraphs)
    await flush()

    // targetLang "zh-CN" requested; cached "ja" → miss.
    expect(h.enqueueSegment).toHaveBeenCalledOnce()
    expect(h.setSegmentStatus).not.toHaveBeenCalled()
    expect(h.touchCachedPage).not.toHaveBeenCalled()
  })

  it("paragraph count mismatch: treats cache row as stale and enqueues fresh", async () => {
    const cached = new Map<string, PdfTranslationRow>([
      [
        "file1:0",
        {
          id: "file1:0",
          fileHash: "file1",
          pageIndex: 0,
          targetLang: "zh-CN",
          providerId: "openai",
          // Cached with 1 paragraph...
          paragraphs: [{ srcHash: Sha256Hex("hello"), translation: "你好" }],
          createdAt: 1000,
          lastAccessedAt: 1000,
        },
      ],
    ])
    const h = makeHarness({ cached })
    // ...but now page extracts 2 paragraphs.
    const paragraphs = [makeParagraph(0, 0, "hello"), makeParagraph(0, 1, "world")]

    await h.coordinator.startPage(0, paragraphs)
    await flush()

    expect(h.enqueueSegment).toHaveBeenCalledTimes(2)
    expect(h.setSegmentStatus).not.toHaveBeenCalled()
  })

  it("abort() prevents subsequent cache writes and enqueues", async () => {
    const h = makeHarness()
    const paragraphs = [makeParagraph(0, 0, "hello")]

    await h.coordinator.startPage(0, paragraphs)
    expect(h.enqueueSegment).toHaveBeenCalledOnce()

    h.coordinator.abort()
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "你好" })
    await flush()

    expect(h.putCachedPage).not.toHaveBeenCalled()
    expect(h.onPageSuccess).not.toHaveBeenCalled()

    // Post-abort startPage: no-op.
    await h.coordinator.startPage(1, [makeParagraph(1, 0, "beta")])
    expect(h.enqueueSegment).toHaveBeenCalledOnce() // unchanged
  })

  it("recordParagraphResult for an unknown page is ignored", async () => {
    const h = makeHarness()
    // No startPage called for page 5.
    h.coordinator.recordParagraphResult(5, 0, { kind: "done", translation: "x" })
    await flush()
    expect(h.putCachedPage).not.toHaveBeenCalled()
    expect(h.onPageSuccess).not.toHaveBeenCalled()
  })

  it("after cache hit, recordParagraphResult is ignored (no double onPageSuccess)", async () => {
    const cached = new Map<string, PdfTranslationRow>([
      [
        "file1:0",
        {
          id: "file1:0",
          fileHash: "file1",
          pageIndex: 0,
          targetLang: "zh-CN",
          providerId: "openai",
          paragraphs: [{ srcHash: Sha256Hex("hello"), translation: "你好" }],
          createdAt: 1000,
          lastAccessedAt: 1000,
        },
      ],
    ])
    const h = makeHarness({ cached })

    await h.coordinator.startPage(0, [makeParagraph(0, 0, "hello")])
    await flush()

    // A late scheduler result shouldn't re-trigger anything.
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "ignored" })
    await flush()

    expect(h.putCachedPage).not.toHaveBeenCalled()
    expect(h.onPageSuccess).not.toHaveBeenCalled()
  })

  it("unloadPage: subsequent recordParagraphResult for that page is a no-op", async () => {
    const h = makeHarness()
    const paragraphs = [
      makeParagraph(0, 0, "alpha"),
      makeParagraph(0, 1, "beta"),
    ]

    await h.coordinator.startPage(0, paragraphs)
    h.coordinator.recordParagraphResult(0, 0, { kind: "done", translation: "甲" })

    // Evict page 0 (simulates LRU cap in main.ts).
    h.coordinator.unloadPage(0)

    // Late paragraph completion arrives after eviction — must not finalize.
    h.coordinator.recordParagraphResult(0, 1, { kind: "done", translation: "乙" })
    await flush()

    expect(h.putCachedPage).not.toHaveBeenCalled()
    expect(h.onPageSuccess).not.toHaveBeenCalled()
  })

  it("unloadPage: does not affect other pages' state", async () => {
    const h = makeHarness()
    const page0 = [makeParagraph(0, 0, "a0"), makeParagraph(0, 1, "a1")]
    const page1 = [makeParagraph(1, 0, "b0"), makeParagraph(1, 1, "b1")]

    await h.coordinator.startPage(0, page0)
    await h.coordinator.startPage(1, page1)

    // Evict page 0; page 1 must still finalize normally.
    h.coordinator.unloadPage(0)

    h.coordinator.recordParagraphResult(1, 0, { kind: "done", translation: "b0-tr" })
    h.coordinator.recordParagraphResult(1, 1, { kind: "done", translation: "b1-tr" })
    await flush()

    expect(h.putCachedPage).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledOnce()
    expect(h.onPageSuccess).toHaveBeenCalledWith(1)
  })

  it("unloadPage: unknown page is a safe no-op", () => {
    const h = makeHarness()
    expect(() => h.coordinator.unloadPage(99)).not.toThrow()
  })

  it("unloadPage then re-startPage: cache hit re-fans out done status", async () => {
    // After eviction, a re-visit should re-hydrate from the cache cleanly.
    const cached = new Map<string, PdfTranslationRow>([
      [
        "file1:0",
        {
          id: "file1:0",
          fileHash: "file1",
          pageIndex: 0,
          targetLang: "zh-CN",
          providerId: "openai",
          paragraphs: [{ srcHash: Sha256Hex("hello"), translation: "你好" }],
          createdAt: 1000,
          lastAccessedAt: 1000,
        },
      ],
    ])
    const h = makeHarness({ cached })
    const paragraphs = [makeParagraph(0, 0, "hello")]

    await h.coordinator.startPage(0, paragraphs)
    await flush()
    expect(h.setSegmentStatus).toHaveBeenCalledOnce()

    // Evict, then revisit — cache lookup happens again and fans out done.
    h.coordinator.unloadPage(0)
    await h.coordinator.startPage(0, paragraphs)
    await flush()

    expect(h.setSegmentStatus).toHaveBeenCalledTimes(2)
    expect(h.enqueueSegment).not.toHaveBeenCalled()
  })

  it("cache-lookup failure: logs + falls through to enqueue path", async () => {
    const h = makeHarness()
    h.getCachedPage.mockRejectedValueOnce(new Error("dexie offline"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await h.coordinator.startPage(0, [makeParagraph(0, 0, "hello")])
    await flush()

    expect(h.enqueueSegment).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})
