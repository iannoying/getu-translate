/**
 * PageCacheCoordinator (PR #B3 Task 4).
 *
 * Bridges the paragraph-granular scheduler (PR #B2) with the page-granular
 * cache (`pdfTranslations` Dexie table, Task 1). Responsibilities:
 *
 *   1. **Start-of-page**: before the scheduler sees a page, check the cache.
 *      - HIT: fan out `{ kind: "done", translation }` to every paragraph's
 *        status atom directly; bump LRU via `touchCachedPage`; skip the
 *        scheduler entirely.
 *      - MISS: enqueue each paragraph through the scheduler as before.
 *
 *   2. **End-of-page**: as paragraphs finish, track completion per page. When
 *      every paragraph of a page reaches `{ kind: "done" }`, write the full
 *      row to the cache and fire `onPageSuccess(pageIndex)` exactly once.
 *      If any paragraph errors, the page is marked failed and the cache write
 *      is suppressed — partial pages never land in the cache.
 *
 * Design notes
 * ------------
 *   - Pure class: no React, no atom imports, no Dexie imports. Every sink is
 *     injected so unit tests can substitute fakes.
 *   - `recordParagraphResult` is idempotent: repeated `done` for the same
 *     paragraph counts once; repeated full-page completions don't double-write.
 *   - Pages are tracked independently; interleaved completions across multiple
 *     pages each emit their own cache row when their own page is full.
 *   - `abort()` clears in-memory state so a subsequent same-coordinator
 *     lifetime (unusual, but defensive) doesn't leak stale counts.
 *   - `onPageSuccess` is a hook point for PR #B3 Task 5 (quota increment).
 *     The coordinator never calls it for cache-hit pages — only for pages
 *     that were freshly translated via the scheduler.
 */
import type { Paragraph } from "../paragraph/types"
import type { SegmentStatus } from "./atoms"
import type {
  PdfTranslationParagraph,
  PdfTranslationRow,
} from "@/utils/db/dexie/pdf-translations"
import { Sha256Hex } from "@/utils/hash"

export interface CoordinatorDeps {
  /** File-level identifier used as part of the cache key + segment key. */
  fileHash: string
  /** Target language ISO code; part of the cache key. */
  targetLang: string
  /** Provider id (e.g. `"openai"`); part of the cache key. */
  providerId: string
  /**
   * Status sink. For cache-hit paragraphs the coordinator calls this with
   * `{ kind: "done", translation }` directly (bypassing the scheduler).
   */
  setSegmentStatus: (pageIndex: number, paragraphIndex: number, status: SegmentStatus) => void
  /**
   * Enqueue a paragraph for translation via the scheduler. Called only on
   * cache miss; cache-hit paragraphs never touch the scheduler.
   */
  enqueueSegment: (fileHash: string, paragraph: Paragraph) => void
  /** Cache lookup. Injected for testability. */
  getCachedPage: (
    fileHash: string,
    pageIndex: number,
    targetLang: string,
    providerId: string,
  ) => Promise<PdfTranslationRow | null>
  /** Cache write. Injected for testability. */
  putCachedPage: (row: Omit<PdfTranslationRow, "lastAccessedAt">) => Promise<void>
  /** Bump LRU on cache hit. Injected for testability. */
  touchCachedPage: (fileHash: string, pageIndex: number) => Promise<void>
  /**
   * Hook called exactly once per freshly-translated page (i.e. every
   * paragraph on the page finished via the scheduler with `done` status and
   * the page was not served from cache). Used by Task 5 to increment the
   * daily quota counter.
   */
  onPageSuccess?: (pageIndex: number) => void
  /**
   * Supplies `Date.now()`. Injected so tests can pin `createdAt`.
   */
  now?: () => number
}

/**
 * Per-page tracking state. One entry is created in `startPage` and mutated
 * during `recordParagraphResult` calls.
 */
interface PageState {
  /** Paragraphs for this page in original order. */
  readonly paragraphs: Paragraph[]
  /**
   * Translations indexed by `paragraphIndex`. Filled in as each paragraph
   * reports `{ kind: "done" }`. `undefined` means "not yet done".
   */
  readonly translations: Array<string | undefined>
  /** Number of paragraphs that have reached `done` (never decremented). */
  doneCount: number
  /** `true` once any paragraph reports `error`; suppresses cache write. */
  errored: boolean
  /** `true` once the page was served from cache (skip recordParagraphResult tracking). */
  fromCache: boolean
  /** `true` once a cache row has been written / onPageSuccess has fired. */
  finalized: boolean
}

export class PageCacheCoordinator {
  private readonly deps: CoordinatorDeps
  private readonly pages = new Map<number, PageState>()
  private aborted = false

  constructor(deps: CoordinatorDeps) {
    this.deps = deps
  }

  /**
   * Start processing a page. On cache hit, fans out `done` status to every
   * paragraph + touches LRU + returns without touching the scheduler. On
   * cache miss, records state for completion tracking and enqueues every
   * paragraph.
   */
  async startPage(pageIndex: number, paragraphs: Paragraph[]): Promise<void> {
    if (this.aborted)
      return

    // Defensive: if startPage is called twice for the same page (e.g. a zoom
    // re-render before we've recorded any result), preserve the existing
    // state so in-flight scheduler jobs aren't orphaned. We still re-check
    // the cache, because the first attempt may have missed before a
    // concurrent put from another viewer tab landed — but this is rare, so
    // we optimise for the common case and short-circuit.
    const existing = this.pages.get(pageIndex)
    if (existing && (existing.fromCache || existing.finalized))
      return

    const { fileHash, targetLang, providerId } = this.deps

    let hit: PdfTranslationRow | null = null
    try {
      hit = await this.deps.getCachedPage(fileHash, pageIndex, targetLang, providerId)
    }
    catch (err) {
      // Cache lookup failures must never block translation. Log and fall
      // through to the miss path.
      console.warn(
        `[pdf-viewer] cache lookup failed for ${fileHash}:${pageIndex}`,
        err,
      )
    }

    // Re-check abort after the async lookup.
    if (this.aborted)
      return

    if (hit && paragraphsMatch(paragraphs, hit.paragraphs)) {
      // Cache hit: fan out done status + touch LRU. Skip scheduler.
      this.pages.set(pageIndex, {
        paragraphs,
        translations: hit.paragraphs.map(p => p.translation),
        doneCount: paragraphs.length,
        errored: false,
        fromCache: true,
        finalized: true,
      })
      for (let i = 0; i < paragraphs.length; i++) {
        this.deps.setSegmentStatus(pageIndex, i, {
          kind: "done",
          translation: hit.paragraphs[i].translation,
        })
      }
      // Fire-and-forget: LRU bump is best-effort.
      void this.deps.touchCachedPage(fileHash, pageIndex).catch((err) => {
        console.warn(
          `[pdf-viewer] touchCachedPage failed for ${fileHash}:${pageIndex}`,
          err,
        )
      })
      return
    }

    // Cache miss (or mismatch): track per-page state and enqueue every
    // paragraph. `recordParagraphResult` owns the write-on-success path.
    if (!existing) {
      this.pages.set(pageIndex, {
        paragraphs,
        translations: Array.from<string | undefined>({ length: paragraphs.length }).fill(undefined),
        doneCount: 0,
        errored: false,
        fromCache: false,
        finalized: false,
      })
    }
    for (const paragraph of paragraphs) {
      this.deps.enqueueSegment(fileHash, paragraph)
    }
  }

  /**
   * Called by the scheduler's setStatus sink once per transition. Tracks per-
   * page completion and writes the cache row + fires onPageSuccess when every
   * paragraph on a page has reached `done`. Idempotent: repeated calls for
   * the same (pageIndex, paragraphIndex, done) are no-ops after the first.
   */
  recordParagraphResult(
    pageIndex: number,
    paragraphIndex: number,
    status: SegmentStatus,
  ): void {
    if (this.aborted)
      return

    const state = this.pages.get(pageIndex)
    // Unknown page: probably a race where scheduler results land before
    // startPage completed its cache check. Ignore — startPage will re-check
    // and either HIT (overriding) or MISS (re-tracking).
    if (!state)
      return

    // Cache-hit pages already finalized; nothing to do.
    if (state.fromCache || state.finalized)
      return

    if (status.kind === "error") {
      // Record the failure and keep going. We intentionally don't set
      // `finalized` — a later `error` → re-enqueue → `done` retry path is
      // supported by the scheduler, and once the page recovers we still want
      // to write the cache. But we flag `errored` for the moment so if the
      // page happens to complete other paragraphs first we don't prematurely
      // write a partial row.
      state.errored = true
      return
    }

    if (status.kind !== "done")
      return

    // Idempotency: if this paragraph already has a translation recorded,
    // skip re-counting. (Scheduler dedup + coordinator finalized guard
    // should prevent this, but be defensive.)
    if (state.translations[paragraphIndex] !== undefined)
      return

    state.translations[paragraphIndex] = status.translation
    state.doneCount += 1

    // Not every paragraph has landed yet — wait for the rest.
    //
    // Note: we don't clear `state.errored` here — once set it stays set for
    // the lifetime of this PageState. The final-write guard below uses
    // `translations.includes(undefined)` to detect incomplete pages, which
    // correctly handles retry-after-error (error → translating → done)
    // since a successful retry writes `state.translations[i] = translation`
    // and `doneCount` eventually reaches `paragraphs.length`.
    if (state.doneCount < state.paragraphs.length)
      return

    // All paragraphs done. Defensive check against weird interleavings where
    // `errored` was set but some slot is still `undefined` — e.g. error →
    // done for the same index, which the scheduler doesn't currently
    // produce but we treat conservatively: don't write a partial cache row.
    if (state.errored && state.translations.includes(undefined))
      return

    state.finalized = true

    const row: Omit<PdfTranslationRow, "lastAccessedAt"> = {
      id: `${this.deps.fileHash}:${pageIndex}`,
      fileHash: this.deps.fileHash,
      pageIndex,
      targetLang: this.deps.targetLang,
      providerId: this.deps.providerId,
      paragraphs: state.paragraphs.map<PdfTranslationParagraph>((paragraph, i) => ({
        srcHash: Sha256Hex(paragraph.text),
        translation: state.translations[i] as string,
      })),
      createdAt: (this.deps.now ?? Date.now)(),
    }

    // Fire-and-forget: cache write failures must not block the UI.
    void this.deps.putCachedPage(row).catch((err) => {
      console.warn(
        `[pdf-viewer] putCachedPage failed for ${this.deps.fileHash}:${pageIndex}`,
        err,
      )
    })

    this.deps.onPageSuccess?.(pageIndex)
  }

  /**
   * Cancel in-flight coordinator tracking. Pending cache writes are
   * suppressed; already-finalized pages are untouched. Safe to call
   * multiple times.
   */
  abort(): void {
    this.aborted = true
    this.pages.clear()
  }
}

/**
 * Guard against stale cache rows whose paragraph count doesn't match the
 * freshly-extracted paragraphs. A mismatch means the PDF changed (or our
 * aggregation algorithm did) since the row was written, and we must fall
 * through to the miss path. Paragraph-level `srcHash` verification happens
 * later if we ever want per-paragraph invalidation; for B3 page-level count
 * match is sufficient.
 */
function paragraphsMatch(
  paragraphs: Paragraph[],
  cached: PdfTranslationParagraph[],
): boolean {
  return paragraphs.length === cached.length
}
