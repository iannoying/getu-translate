/**
 * PdfQuotaGate (PR #B3 Task 5).
 *
 * Imperative wrapper around the PDF-page quota used by the non-React viewer
 * entrypoint. The React hook `usePdfTranslationQuota` is the source of truth
 * inside React trees (viewer Options UI, etc.). The viewer's `main.ts` however
 * is imperative and needs to ask "can I translate one more fresh page?" /
 * "record that a fresh page succeeded" from plain callbacks wired into the
 * `PageCacheCoordinator`.
 *
 * This module is intentionally pure:
 *   - No React imports.
 *   - No Dexie imports.
 *   - No entitlements-atom imports.
 *
 * Every data dependency is injected by the caller (main.ts wires the real
 * entitlements reader + Dexie-backed counter; tests inject fakes). This keeps
 * the gate 100 % unit-testable without jsdom / React / IndexedDB.
 *
 * Semantics mirror M2 "Q2 count-on-success" (see `docs/plans/
 * 2026-04-22-m3-pdf-translate-pr-b3.md` Task 5):
 *   - `canTranslatePage()` returns true when the user is Pro OR when today's
 *     counter is still under `limit`.
 *   - `recordPageSuccess()` increments the Dexie counter and returns the new
 *     count. Callers check `newCount >= limit` after the write to decide
 *     whether to show the UpgradeDialog / abort the scheduler.
 *   - `isExhausted()` is a convenience predicate — "is the user over the
 *     line right now?". Pro users are never exhausted.
 *
 * Cache-hit pages MUST NOT go through this gate: the coordinator's
 * `onPageSuccess` callback only fires for freshly-translated pages, so the
 * gate is naturally called only on the fresh-write path.
 */

export interface PdfQuotaGate {
  /**
   * Returns true if the user is allowed to translate one more fresh page
   * right now. Pro users with `pdf_translate_unlimited` always return true.
   * Free users return true iff today's counter is strictly less than
   * `limit`.
   */
  canTranslatePage: () => Promise<boolean>
  /**
   * Increment today's fresh-page counter and return the new count. The
   * caller should compare the result against `limit` to decide whether the
   * scheduler should now abort + the UpgradeDialog should appear.
   *
   * For Pro users this still increments (so usage UI can show a running
   * tally) but the returned count is not used to gate anything.
   *
   * Rejects if the underlying counter store throws. Callers in main.ts wrap
   * in try/catch because they run under `void`.
   */
  recordPageSuccess: () => Promise<number>
  /**
   * Convenience predicate: true when the user has hit the free-tier limit
   * (and therefore translating one more page should be blocked). Pro users
   * always return false. Useful for the "should I even enqueue this next
   * page?" pre-check in main.ts.
   */
  isExhausted: () => Promise<boolean>
}

export interface PdfQuotaGateDeps {
  /**
   * Snapshot of the user's Pro status. Called synchronously on every gate
   * check so it should be cheap (e.g. read a Jotai atom / a cached value).
   * Returns true iff the user has `pdf_translate_unlimited` AND the plan is
   * currently active.
   */
  isPro: () => boolean
  /** Read today's page counter. Typically `getPdfPageUsage`. */
  getUsage: () => Promise<number>
  /**
   * Increment today's counter and return the new count. Typically
   * `incrementPdfPageUsage`.
   */
  increment: () => Promise<number>
  /** Free-tier daily cap. Typically `FREE_PDF_PAGES_PER_DAY`. */
  limit: number
}

export function createPdfQuotaGate(deps: PdfQuotaGateDeps): PdfQuotaGate {
  return {
    async canTranslatePage() {
      if (deps.isPro())
        return true
      const used = await deps.getUsage()
      return used < deps.limit
    },

    async recordPageSuccess() {
      return deps.increment()
    },

    async isExhausted() {
      if (deps.isPro())
        return false
      const used = await deps.getUsage()
      return used >= deps.limit
    },
  }
}
