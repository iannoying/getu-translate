import { FREE_PDF_PAGES_PER_DAY } from "@getu/definitions"
import { useCallback, useEffect, useState } from "react"
import { useEntitlements } from "@/hooks/use-entitlements"
import { hasFeature, isPro } from "@/types/entitlements"
import { authClient } from "@/utils/auth/auth-client"
import {
  getPdfPageUsage,
  incrementPdfPageUsage,
} from "@/utils/db/dexie/pdf-translation-usage"

export { FREE_PDF_PAGES_PER_DAY }

export interface PdfQuotaState {
  /** True while entitlements or today's counter are still resolving. */
  isLoading: boolean
  /** Today's consumed page count. Reflects last Dexie read (updated on each success). */
  used: number
  /** Numeric cap for Free, or the string "unlimited" for Pro / Enterprise. */
  limit: number | "unlimited"
  /** Cheap predicate: true when translating one more page would currently be allowed. */
  canTranslatePage: boolean
  /**
   * Increment today's page counter (Q2 count-on-success) and return the new
   * count. Callers invoke this only AFTER a page has successfully translated
   * from the provider — cache hits must not call this.
   *
   * Unlike the input-translation hook's `checkAndIncrement`, this hook's
   * contract is "record a success". The caller decides whether to admit the
   * next page by consulting `canTranslatePage`/`used` against the returned
   * count; the scheduler's hard-stop logic lives at the call site (Task 5).
   *
   * Errors: rejects on Dexie failure. Callers (Task 5 scheduler) MUST wrap
   * in try/catch. We don't swallow errors here because the caller needs to
   * know if the counter write succeeded before deciding quota state.
   */
  recordPageSuccess: () => Promise<number>
}

/**
 * Reactive source of truth for "can the user translate one more PDF page
 * right now?". Combines entitlements (from M0 billing infra) with the local
 * Dexie counter so it keeps working offline. Mirrors
 * `useInputTranslationQuota` structurally — only the feature key, table,
 * and function names differ.
 *
 * Liveness: `used` is read once on mount and updated locally by
 * `recordPageSuccess`. No Dexie liveQuery — counter changes from another
 * tab will not update this hook's state (mirrors M2 input-quota precedent).
 * Acceptable because the viewer tab is the primary driver.
 */
export function usePdfTranslationQuota(): PdfQuotaState {
  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const sessionLoading = session?.isPending ?? false
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements(userId)

  const [used, setUsed] = useState(0)
  const [usageLoading, setUsageLoading] = useState(true)

  // Gate the unlimited feature on BOTH tier-is-paid-and-active AND the
  // feature flag. `hasFeature` alone would keep an expired Pro uncapped if
  // the cached entitlements still list the feature (see code review on #35).
  const unlimited = isPro(entitlements) && hasFeature(entitlements, "pdf_translate_unlimited")
  const limit: number | "unlimited" = unlimited ? "unlimited" : FREE_PDF_PAGES_PER_DAY

  useEffect(() => {
    let cancelled = false
    getPdfPageUsage()
      .then((n) => {
        if (!cancelled) {
          setUsed(n)
          setUsageLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fail-open for the loader — the actual gate happens in
          // recordPageSuccess which will retry the DB.
          setUsed(0)
          setUsageLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isLoading = sessionLoading || entitlementsLoading || usageLoading

  const canTranslatePage = !isLoading && (unlimited || used < FREE_PDF_PAGES_PER_DAY)

  const recordPageSuccess = useCallback(async (): Promise<number> => {
    const next = await incrementPdfPageUsage()
    setUsed(next)
    return next
  }, [])

  return { isLoading, used, limit, canTranslatePage, recordPageSuccess }
}
