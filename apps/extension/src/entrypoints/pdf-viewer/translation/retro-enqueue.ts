import type { Paragraph } from "../paragraph/types"

/**
 * Retroactive enqueue helper (M3 PR#C Task 7 follow-up).
 *
 * Fan-out driver used by the first-use toast's Accept handler. Walks the
 * caller-supplied map of `(pdfjs pageNumber → paragraphs)` and calls
 * `startPage(pageIndex, paragraphs)` for each entry, **as long as the
 * sticky Free-tier quota-exhausted flag is still false**. Once the flag
 * flips mid-loop (rare — the scheduler + coordinator are synchronous up
 * to this point, but the callback is re-entrant) we stop issuing new
 * work.
 *
 * Why we break instead of continue:
 *   - `startPage` on a fresh (cache-miss) page would call into the
 *     scheduler, which has already been aborted by the quota flow; the
 *     call would do nothing useful but would still burn a tick of work.
 *   - A cache-hit page *would* still render for free (the coordinator
 *     serves cache hits without consulting the scheduler). But we're
 *     already past that decision point in the Accept flow: if the user
 *     is Free and exhausted, we want to stop here and let them re-open
 *     the PDF tomorrow; letting half the pages render from cache and
 *     the other half stay blank is worse UX than a clean stop.
 *
 * Pure + synchronous so it's 100 % unit-testable without Dexie / React /
 * a real coordinator. `main.ts` wraps it in a closure that binds
 * `coordinator.startPage` + reads `quotaExhaustedRef.current`.
 */
export interface RetroEnqueueDeps {
  /**
   * Snapshot of all paragraphs seen so far this session, keyed by
   * 1-based pdf.js pageNumber (same key `knownParagraphsRef` uses).
   */
  knownParagraphs: ReadonlyMap<number, Paragraph[]>
  /**
   * Reads the sticky Free-tier exhausted flag. Called once per page
   * iteration so a mid-fan-out flip stops further dispatch.
   */
  isQuotaExhausted: () => boolean
  /**
   * Called once per surviving page entry with the 0-based pageIndex
   * (pdf.js pageNumber - 1) and the paragraph list. In production this
   * is `(idx, paras) => void coordinator.startPage(idx, paras)`.
   */
  startPage: (pageIndex: number, paragraphs: Paragraph[]) => void
}

/**
 * Run the retroactive fan-out. Iterates in `knownParagraphs` insertion
 * order (ES Map spec), which matches the order pages were first
 * rendered — so earlier pages get dispatched first, consistent with
 * forward-reading behaviour.
 */
export function runRetroEnqueue(deps: RetroEnqueueDeps): void {
  for (const [pageNumber, paragraphs] of deps.knownParagraphs) {
    if (deps.isQuotaExhausted())
      break
    deps.startPage(pageNumber - 1, paragraphs)
  }
}
