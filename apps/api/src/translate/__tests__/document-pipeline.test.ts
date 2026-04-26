import { describe, expect, it, vi } from "vitest"
import { runTranslationPipeline, type TranslateChunkFn } from "../document-pipeline"
import type { Chunk } from "../document-chunker"

const mkChunks = (n: number): Chunk[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i,
    text: `chunk-${i}`,
    startPage: 1,
    endPage: 1,
  }))

const baseOpts = {
  jobId: "j1",
  modelId: "google",
  sourceLang: "en",
  targetLang: "zh-Hans",
  concurrency: 5,
  maxRetries: 3,
  baseBackoffMs: 5, // tiny in tests
}

describe("runTranslationPipeline", () => {
  it("translates all chunks and returns SegmentsFile", async () => {
    const translate: TranslateChunkFn = async (c) => `translated-${c.index}`
    const progress = vi.fn(async () => {})
    const ac = new AbortController()
    const out = await runTranslationPipeline(mkChunks(3), translate, progress, baseOpts, ac.signal)
    expect(out.jobId).toBe("j1")
    expect(out.modelId).toBe("google")
    expect(out.segments.length).toBe(3)
    expect(out.segments[0].translation).toBe("translated-0")
    expect(out.segments[2].translation).toBe("translated-2")
    // segments order matches chunk index
    for (let i = 0; i < 3; i++) {
      expect(out.segments[i].index).toBe(i)
    }
    // generatedAt is ISO 8601
    expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("writes progress at 25/50/75/100 milestones", async () => {
    const translate: TranslateChunkFn = async (c) => `t-${c.index}`
    const progress = vi.fn(async () => {})
    const ac = new AbortController()
    await runTranslationPipeline(mkChunks(8), translate, progress, baseOpts, ac.signal)

    const calls = progress.mock.calls as unknown as [{ pct: number; stage: string }][]
    const pcts = calls.map((c) => c[0].pct)
    expect(pcts).toContain(25)
    expect(pcts).toContain(50)
    expect(pcts).toContain(75)
    expect(pcts).toContain(100)
    // Final call should report stage="translated" with pct=100
    const finalCall = calls[calls.length - 1]?.[0]
    expect(finalCall?.stage).toBe("translated")
    expect(finalCall?.pct).toBe(100)
  })

  it("retries a failed chunk up to maxRetries and succeeds", async () => {
    const calls: number[] = []
    const translate: TranslateChunkFn = async (c) => {
      calls.push(c.index)
      // Fail twice for chunk 0, succeed on 3rd attempt
      if (calls.filter((x) => x === c.index).length < 3) {
        throw new Error("flaky")
      }
      return `t-${c.index}`
    }
    const ac = new AbortController()
    const out = await runTranslationPipeline(
      mkChunks(1),
      translate,
      async () => {},
      baseOpts,
      ac.signal,
    )
    expect(calls.length).toBe(3)
    expect(out.segments[0].translation).toBe("t-0")
  })

  it("throws if a chunk fails after maxRetries", async () => {
    const translate: TranslateChunkFn = async () => {
      throw new Error("permanent")
    }
    const ac = new AbortController()
    await expect(
      runTranslationPipeline(mkChunks(1), translate, async () => {}, baseOpts, ac.signal),
    ).rejects.toThrow(/permanent/)
  })

  it("respects concurrency limit", async () => {
    let inFlight = 0
    let max = 0
    const translate: TranslateChunkFn = async () => {
      inFlight++
      max = Math.max(max, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return "t"
    }
    const ac = new AbortController()
    await runTranslationPipeline(
      mkChunks(20),
      translate,
      async () => {},
      { ...baseOpts, concurrency: 5 },
      ac.signal,
    )
    expect(max).toBeLessThanOrEqual(5)
  })

  it("aborts cleanly when AbortSignal fires mid-flight", async () => {
    const translate: TranslateChunkFn = (_c, _ctx, signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      )
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 5)
    await expect(
      runTranslationPipeline(mkChunks(10), translate, async () => {}, baseOpts, ac.signal),
    ).rejects.toThrow()
  })

  it("returns empty segments for empty chunks input", async () => {
    const translate: TranslateChunkFn = async () => "should-not-be-called"
    const ac = new AbortController()
    const out = await runTranslationPipeline(
      [],
      translate,
      async () => {},
      baseOpts,
      ac.signal,
    )
    expect(out.segments).toEqual([])
  })

  it("backoff is exponential — 1s, 2s, 4s base", async () => {
    const callTimes: number[] = []
    const translate: TranslateChunkFn = async () => {
      callTimes.push(Date.now())
      const attempt = callTimes.length
      if (attempt < 3) throw new Error("retry me")
      return "ok"
    }
    const ac = new AbortController()
    const start = Date.now()
    await runTranslationPipeline(
      mkChunks(1),
      translate,
      async () => {},
      { ...baseOpts, baseBackoffMs: 50 },
      ac.signal,
    )
    // Total wait: 50ms + 100ms = 150ms (third attempt is immediate)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(140)
    expect(elapsed).toBeLessThan(500) // generous upper bound for CI flakiness
  })
})
