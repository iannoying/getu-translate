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
 */
import type { Paragraph } from "../paragraph/types"
import type { SegmentKey, SegmentStatus } from "./atoms"

export interface SchedulerDeps {
  /** Translate a single paragraph's text. Injected for testability. */
  translate: (text: string) => Promise<string>
  /** Status sink. The scheduler calls this on every state transition. */
  setStatus: (key: SegmentKey, status: SegmentStatus) => void
  /** Max concurrent in-flight translate calls. Defaults to 6. */
  concurrency?: number
  /** Optional external abort signal; when it fires we call `abort()`. */
  signal?: AbortSignal
}

type InternalState = "pending" | "translating" | "done" | "error"

interface QueuedJob {
  readonly key: SegmentKey
  readonly text: string
}

const DEFAULT_CONCURRENCY = 6

export class TranslationScheduler {
  private readonly translate: SchedulerDeps["translate"]
  private readonly setStatus: SchedulerDeps["setStatus"]
  private readonly concurrency: number
  private readonly controller: AbortController

  private readonly state = new Map<SegmentKey, InternalState>()
  private readonly queue: QueuedJob[] = []
  private readonly inFlight = new Set<Promise<void>>()

  constructor(deps: SchedulerDeps) {
    this.translate = deps.translate
    this.setStatus = deps.setStatus
    this.concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY
    this.controller = new AbortController()

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

    try {
      const translation = await this.translate(text)
      if (this.controller.signal.aborted)
        return
      this.state.set(key, "done")
      this.setStatus(key, { kind: "done", translation })
    }
    catch (err) {
      if (this.controller.signal.aborted)
        return
      this.state.set(key, "error")
      this.setStatus(key, {
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
