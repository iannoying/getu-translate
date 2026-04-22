/**
 * Translation scheduler (PR #B2 Task 3).
 *
 * Orchestrates per-segment translation calls with bounded concurrency, abort
 * support, and in-memory dedup. Pure in-memory logic — no atom imports, no
 * pdfjs imports, no DOM. Consumers inject:
 *   - `translate(text)`: domain function (e.g. `translateTextForPage`)
 *   - `setStatus(key, status)`: status sink (e.g. `store.set(segmentStatusAtomFamily(key), …)`)
 *
 * The class deliberately owns a single internal `AbortController` so callers
 * that don't provide an external `signal` can still call `abort()` to cancel
 * every pending job and suppress status writes from any in-flight work.
 *
 * State machine per segment
 * -------------------------
 *   (absent) → pending → translating → done
 *                                    ↘ error → (on re-enqueue) → translating → ...
 *
 * Dedup rules
 * -----------
 *   - Re-enqueue while `pending` / `translating` / `done` → no-op.
 *   - Re-enqueue while `error` → retried (cleared + re-queued).
 *
 * Abort rules
 * -----------
 *   - External `signal` (if passed) aborts → same as calling `abort()`.
 *   - `abort()` marks the scheduler aborted, clears the pending queue, and
 *     causes any in-flight resolve to skip its `setStatus` write.
 *   - We don't forward the signal into `translate()` — callers that want
 *     fetch-level cancellation should plumb it through themselves (e.g. the
 *     injected `translate` can close over the same signal).
 *
 * Retry rules
 * -----------
 *   - On retriable errors (429 / 503 / timeout / network), retry with
 *     exponential back-off: baseDelayMs * 2^attempt (default 1s, 2s, 4s).
 *   - Up to `maxAttempts` total attempts (default 3 = 1 initial + 2 retries).
 *   - Non-retriable errors fail-fast after one attempt.
 *   - `AbortSignal` fires during back-off → pending retries are cancelled,
 *     no `setStatus` write for the aborted segment.
 */
import type { Paragraph } from "../paragraph/types"
import type { SegmentKey, SegmentStatus } from "./atoms"

export interface SchedulerRetryOptions {
  /** Max total attempts including the initial one. Default 3. */
  maxAttempts?: number
  /** Base back-off delay in ms; actual delay = base * 2^attempt. Default 1000. */
  baseDelayMs?: number
  /** Predicate deciding whether an error is worth retrying. Default: 429/503/timeout/network/fetch. */
  isRetriable?: (err: unknown) => boolean
}

export interface SchedulerDeps {
  /** Translate a single paragraph's text. Injected for testability. */
  translate: (text: string) => Promise<string>
  /** Status sink. The scheduler calls this on every state transition. */
  setStatus: (key: SegmentKey, status: SegmentStatus) => void
  /** Max concurrent in-flight translate calls. Defaults to 6. */
  concurrency?: number
  /** Optional external abort signal; when it fires we call `abort()`. */
  signal?: AbortSignal
  /** Optional retry configuration. Defaults apply when omitted. */
  retry?: SchedulerRetryOptions
}

type InternalState = "pending" | "translating" | "done" | "error"

interface QueuedJob {
  readonly key: SegmentKey
  readonly text: string
}

const DEFAULT_CONCURRENCY = 6
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1000

/** Default retriable predicate: recognise 429 / 503 / timeout / network / fetch failures. */
function defaultIsRetriable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes("429") || msg.includes("503"))
      return true
    if (msg.includes("timeout") || msg.includes("network"))
      return true
    if (msg.includes("fetch"))
      return true
  }
  return false
}

/**
 * Abort-aware sleep. Resolves after `ms` milliseconds or as soon as `signal`
 * fires — whichever comes first. Never rejects; caller re-checks `signal.aborted`.
 */
function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const onAbort = (): void => {
      if (timer !== null)
        clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

export class TranslationScheduler {
  private readonly translate: SchedulerDeps["translate"]
  private readonly setStatus: SchedulerDeps["setStatus"]
  private readonly concurrency: number
  private readonly controller: AbortController
  private readonly maxAttempts: number
  private readonly baseDelayMs: number
  private readonly isRetriable: (err: unknown) => boolean

  private readonly state = new Map<SegmentKey, InternalState>()
  private readonly queue: QueuedJob[] = []
  private readonly inFlight = new Set<Promise<void>>()

  constructor(deps: SchedulerDeps) {
    this.translate = deps.translate
    this.setStatus = deps.setStatus
    this.concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY
    this.controller = new AbortController()

    const retry = deps.retry ?? {}
    this.maxAttempts = retry.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.baseDelayMs = retry.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
    this.isRetriable = retry.isRetriable ?? defaultIsRetriable

    if (deps.signal) {
      if (deps.signal.aborted) {
        this.abort()
      }
      else {
        deps.signal.addEventListener("abort", () => this.abort(), { once: true })
      }
    }
  }

  /**
   * Enqueue a paragraph for translation. No-op if the segment is already
   * `pending` / `translating` / `done`; retried if previously `error`.
   */
  enqueue(fileHash: string, paragraph: Paragraph): void {
    if (this.controller.signal.aborted)
      return

    const key: SegmentKey = `${fileHash}:${paragraph.key}`
    const current = this.state.get(key)
    if (current !== undefined && current !== "error")
      return

    this.state.set(key, "pending")
    // Intentionally NOT calling `setStatus(key, { kind: "pending" })`:
    // `segmentStatusAtomFamily` already defaults to `{ kind: "pending" }`,
    // so emitting it again would trigger a redundant notify on every
    // subscribed slot (N paragraphs × every enqueue = N spurious renders).
    // The first real transition subscribers observe is `translating`.
    this.queue.push({ key, text: paragraph.text })
    this.pump()
  }

  /**
   * Cancel pending work and suppress status writes from in-flight jobs.
   * Safe to call multiple times.
   */
  abort(): void {
    if (this.controller.signal.aborted)
      return
    this.controller.abort()
    // Drop pending jobs so `size()` reflects the new reality and future
    // `enqueue()` calls are short-circuited by the aborted guard.
    this.queue.length = 0
  }

  /** Count of pending + in-flight jobs (diagnostic; no semantic meaning). */
  size(): number {
    return this.queue.length + this.inFlight.size
  }

  /**
   * Drain the queue until either it's empty or we've hit concurrency.
   * Re-entrant: `runJob` calls `pump()` again on completion.
   */
  private pump(): void {
    while (
      !this.controller.signal.aborted
      && this.inFlight.size < this.concurrency
      && this.queue.length > 0
    ) {
      const job = this.queue.shift()!
      const promise = this.runJob(job.key, job.text)
      this.inFlight.add(promise)
      void promise.finally(() => {
        this.inFlight.delete(promise)
        this.pump()
      })
    }
  }

  private async runJob(key: SegmentKey, text: string): Promise<void> {
    if (this.controller.signal.aborted)
      return

    this.state.set(key, "translating")
    this.setStatus(key, { kind: "translating" })

    let lastErr: unknown
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (this.controller.signal.aborted)
        return

      try {
        const translation = await this.translate(text)
        if (this.controller.signal.aborted)
          return
        this.state.set(key, "done")
        this.setStatus(key, { kind: "done", translation })
        return
      }
      catch (err) {
        lastErr = err
        const hasMoreAttempts = attempt < this.maxAttempts - 1
        if (!hasMoreAttempts || !this.isRetriable(err))
          break

        const delayMs = this.baseDelayMs * 2 ** attempt
        await sleepWithAbort(delayMs, this.controller.signal)
      }
    }

    if (this.controller.signal.aborted)
      return
    this.state.set(key, "error")
    this.setStatus(key, {
      kind: "error",
      message: lastErr instanceof Error ? lastErr.message : String(lastErr),
    })
  }
}
