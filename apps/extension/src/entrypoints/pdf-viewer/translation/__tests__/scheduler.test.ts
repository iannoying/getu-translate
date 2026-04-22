import type { Paragraph } from "../../paragraph/types"
import type { SegmentKey, SegmentStatus } from "../atoms"
import { describe, expect, it, vi } from "vitest"
import { TranslationScheduler } from "../scheduler"

// --- helpers ---------------------------------------------------------------

function makeParagraph(key: string, text: string): Paragraph {
  return {
    items: [],
    text,
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    fontSize: 12,
    key,
  }
}

/** Deferred promise: resolve / reject on demand for deterministic concurrency tests. */
function defer<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Collect every setStatus call so we can assert the full transition sequence. */
function makeStatusSink(): {
  setStatus: (key: SegmentKey, status: SegmentStatus) => void
  log: Array<{ key: SegmentKey, status: SegmentStatus }>
  latest: Map<SegmentKey, SegmentStatus>
} {
  const log: Array<{ key: SegmentKey, status: SegmentStatus }> = []
  const latest = new Map<SegmentKey, SegmentStatus>()
  return {
    setStatus: (key, status) => {
      log.push({ key, status })
      latest.set(key, status)
    },
    log,
    latest,
  }
}

/** Run all currently-pending microtasks so scheduler promise chains settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

// --- tests -----------------------------------------------------------------

describe("translationScheduler", () => {
  it("runs one paragraph through translating → done (pending is the atom default, not emitted)", async () => {
    const sink = makeStatusSink()
    const translate = vi.fn(async (text: string) => `[zh] ${text}`)
    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
    })

    scheduler.enqueue("file1", makeParagraph("p-0-0", "hello"))
    await flush()

    expect(translate).toHaveBeenCalledOnce()
    expect(translate).toHaveBeenCalledWith("hello")
    // `pending` is NOT emitted — `segmentStatusAtomFamily` already defaults
    // to `{ kind: "pending" }`, so re-emitting on every enqueue would cause
    // a spurious notify per segment (N paragraphs = N redundant renders).
    expect(sink.log.map(entry => ({ key: entry.key, kind: entry.status.kind }))).toEqual([
      { key: "file1:p-0-0", kind: "translating" },
      { key: "file1:p-0-0", kind: "done" },
    ])
    expect(sink.latest.get("file1:p-0-0")).toEqual({ kind: "done", translation: "[zh] hello" })
    expect(scheduler.size()).toBe(0)
  })

  it("captures translate failures as error status with the message", async () => {
    const sink = makeStatusSink()
    const translate = vi.fn(async () => {
      throw new Error("network down")
    })
    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
    })

    scheduler.enqueue("file1", makeParagraph("p-0-0", "boom"))
    await flush()

    expect(sink.latest.get("file1:p-0-0")).toEqual({ kind: "error", message: "network down" })
  })

  it("coerces non-Error rejections into a string message", async () => {
    const sink = makeStatusSink()
    // eslint-disable-next-line prefer-promise-reject-errors -- explicitly testing non-Error rejection handling
    const translate = vi.fn(() => Promise.reject("stringly typed"))
    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
    })

    scheduler.enqueue("file1", makeParagraph("p-0-0", "boom"))
    await flush()

    expect(sink.latest.get("file1:p-0-0")).toEqual({ kind: "error", message: "stringly typed" })
  })

  it("respects concurrency: at most N translate calls in flight simultaneously", async () => {
    const sink = makeStatusSink()
    const deferreds: Array<ReturnType<typeof defer<string>>> = []
    let inFlight = 0
    let peak = 0

    const translate = vi.fn(async (text: string) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      const d = defer<string>()
      deferreds.push(d)
      try {
        return await d.promise.then(v => `${v}:${text}`)
      }
      finally {
        inFlight -= 1
      }
    })

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
      concurrency: 2,
    })

    for (let i = 0; i < 10; i++) {
      scheduler.enqueue("file1", makeParagraph(`p-0-${i}`, `t${i}`))
    }
    await flush()

    // Initially only concurrency (2) are in flight.
    expect(translate).toHaveBeenCalledTimes(2)
    expect(peak).toBe(2)

    // Drain them one by one; each completion releases one slot.
    while (deferreds.length > 0) {
      const next = deferreds.shift()!
      next.resolve("ok")
      await flush()
      expect(peak).toBeLessThanOrEqual(2)
    }

    expect(translate).toHaveBeenCalledTimes(10)
    expect(peak).toBe(2)
    expect(scheduler.size()).toBe(0)
  })

  it("defaults concurrency to 6 when not specified", async () => {
    const sink = makeStatusSink()
    const deferreds: Array<ReturnType<typeof defer<string>>> = []

    const translate = vi.fn(async () => {
      const d = defer<string>()
      deferreds.push(d)
      return d.promise
    })

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
    })

    for (let i = 0; i < 20; i++) {
      scheduler.enqueue("file1", makeParagraph(`p-0-${i}`, `t${i}`))
    }
    await flush()

    expect(translate).toHaveBeenCalledTimes(6)
    // Cleanup: resolve everything so no dangling promises.
    for (const d of deferreds) d.resolve("ok")
  })

  it("abort() before any work starts prevents translate calls", async () => {
    const sink = makeStatusSink()
    const translate = vi.fn(async () => "never")
    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
    })

    scheduler.abort()
    scheduler.enqueue("file1", makeParagraph("p-0-0", "hello"))
    scheduler.enqueue("file1", makeParagraph("p-0-1", "world"))
    await flush()

    expect(translate).not.toHaveBeenCalled()
    expect(sink.log).toHaveLength(0)
    expect(scheduler.size()).toBe(0)
  })

  it("abort() mid-flight prevents new jobs starting and suppresses setStatus for in-flight resolutions", async () => {
    const sink = makeStatusSink()
    const deferreds: Array<ReturnType<typeof defer<string>>> = []

    const translate = vi.fn(async () => {
      const d = defer<string>()
      deferreds.push(d)
      return d.promise
    })

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
      concurrency: 2,
    })

    for (let i = 0; i < 5; i++) {
      scheduler.enqueue("file1", makeParagraph(`p-0-${i}`, `t${i}`))
    }
    await flush()

    expect(translate).toHaveBeenCalledTimes(2)

    scheduler.abort()

    // Now resolve the in-flight promises — their setStatus should be suppressed.
    const statusCountBeforeResolve = sink.log.length
    for (const d of deferreds) d.resolve("late")
    await flush()

    // No new translate calls should have started after abort.
    expect(translate).toHaveBeenCalledTimes(2)
    // No new setStatus calls after abort (status log is frozen at abort-time).
    expect(sink.log).toHaveLength(statusCountBeforeResolve)
    // No "done" status recorded for any segment.
    for (const entry of sink.log) {
      expect(entry.status.kind).not.toBe("done")
    }
  })

  it("dedups re-enqueue while a job is pending or in-flight", async () => {
    const sink = makeStatusSink()
    const d = defer<string>()
    const translate = vi.fn(async () => d.promise)

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
      concurrency: 1,
    })

    const p = makeParagraph("p-0-0", "same text")
    scheduler.enqueue("file1", p)
    scheduler.enqueue("file1", p)
    scheduler.enqueue("file1", p)
    await flush()

    expect(translate).toHaveBeenCalledTimes(1)

    // Complete it and re-enqueue again — still no-op because state is now "done".
    d.resolve("ok")
    await flush()
    scheduler.enqueue("file1", p)
    await flush()
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it("retries a segment that previously errored when re-enqueued", async () => {
    const sink = makeStatusSink()
    let call = 0
    const translate = vi.fn(async (text: string) => {
      call += 1
      if (call === 1)
        throw new Error("flaky")
      return `[zh] ${text}`
    })

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
    })

    const p = makeParagraph("p-0-0", "retry me")
    scheduler.enqueue("file1", p)
    await flush()
    expect(sink.latest.get("file1:p-0-0")).toEqual({ kind: "error", message: "flaky" })

    // Re-enqueue after error → retried.
    scheduler.enqueue("file1", p)
    await flush()

    expect(translate).toHaveBeenCalledTimes(2)
    expect(sink.latest.get("file1:p-0-0")).toEqual({ kind: "done", translation: "[zh] retry me" })
  })

  it("keeps segments from different files isolated via the fileHash prefix", async () => {
    const sink = makeStatusSink()
    const translate = vi.fn(async (text: string) => `T(${text})`)

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
    })

    const p = makeParagraph("p-0-0", "shared text")
    scheduler.enqueue("fileA", p)
    scheduler.enqueue("fileB", p)
    await flush()

    expect(translate).toHaveBeenCalledTimes(2)
    expect(sink.latest.get("fileA:p-0-0")).toEqual({ kind: "done", translation: "T(shared text)" })
    expect(sink.latest.get("fileB:p-0-0")).toEqual({ kind: "done", translation: "T(shared text)" })
  })

  it("aborts via an external AbortSignal", async () => {
    const sink = makeStatusSink()
    const translate = vi.fn(async () => "never")
    const external = new AbortController()

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
      signal: external.signal,
    })

    external.abort()
    scheduler.enqueue("file1", makeParagraph("p-0-0", "hello"))
    await flush()

    expect(translate).not.toHaveBeenCalled()
    expect(sink.log).toHaveLength(0)
  })

  it("handles an already-aborted external signal passed at construction", async () => {
    const sink = makeStatusSink()
    const translate = vi.fn(async () => "never")
    const external = new AbortController()
    external.abort()

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
      signal: external.signal,
    })

    scheduler.enqueue("file1", makeParagraph("p-0-0", "hello"))
    await flush()

    expect(translate).not.toHaveBeenCalled()
    expect(scheduler.size()).toBe(0)
  })

  it("size() tracks pending + in-flight accurately across a drain", async () => {
    const sink = makeStatusSink()
    const deferreds: Array<ReturnType<typeof defer<string>>> = []
    const translate = vi.fn(async () => {
      const d = defer<string>()
      deferreds.push(d)
      return d.promise
    })

    const scheduler = new TranslationScheduler({
      translate,
      setStatus: sink.setStatus,
      concurrency: 2,
    })

    expect(scheduler.size()).toBe(0)

    for (let i = 0; i < 5; i++) {
      scheduler.enqueue("file1", makeParagraph(`p-0-${i}`, `t${i}`))
    }
    await flush()

    // 2 in-flight + 3 pending = 5
    expect(scheduler.size()).toBe(5)

    deferreds[0].resolve("a")
    await flush()
    // 2 in-flight + 2 pending = 4
    expect(scheduler.size()).toBe(4)

    // Drain the rest.
    while (deferreds.length > 0) {
      deferreds.shift()!.resolve("x")
      await flush()
    }
    expect(scheduler.size()).toBe(0)
  })
})
