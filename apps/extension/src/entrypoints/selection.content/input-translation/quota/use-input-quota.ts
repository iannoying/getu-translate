import { useCallback, useEffect, useState } from "react"
import { useEntitlements } from "@/hooks/use-entitlements"
import { hasFeature } from "@/types/entitlements"
import { authClient } from "@/utils/auth/auth-client"
import {
  getInputTranslationUsage,
  incrementInputTranslationUsage,
} from "@/utils/db/dexie/input-translation-usage"

/**
 * Free-tier daily cap on successful input-field translations. Matches the
 * commercialization table in `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md`.
 */
export const FREE_INPUT_TRANSLATION_DAILY_LIMIT = 50

export interface InputQuotaState {
  /** True while entitlements or today's counter are still resolving. */
  isLoading: boolean
  /** Today's consumed count. Reflects last Dexie read (updated on each attempt). */
  used: number
  /** Numeric cap for Free, or the string "unlimited" for Pro / Enterprise. */
  limit: number | "unlimited"
  /** Cheap predicate: true when a translation would currently be allowed. */
  canTranslate: boolean
  /**
   * Atomically reserve a slot: increments today's counter and returns true when
   * the post-increment value is still within the free cap, OR when the user
   * has the `input_translate_unlimited` feature. Returns false when the call
   * would exceed the cap — but only after writing the increment, so UI can
   * show the exhausted state.
   *
   * Callers MUST treat a false return as "block the translation" — the
   * increment is still recorded because the attempt itself counts.
   */
  checkAndIncrement: () => Promise<boolean>
}

/**
 * Reactive source of truth for "can the user translate one more input field
 * right now?". Combines entitlements (from M0 billing infra) with the local
 * Dexie counter so it keeps working offline.
 */
export function useInputTranslationQuota(): InputQuotaState {
  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const sessionLoading = session?.isPending ?? false
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements(userId)

  const [used, setUsed] = useState(0)
  const [usageLoading, setUsageLoading] = useState(true)

  const unlimited = hasFeature(entitlements, "input_translate_unlimited")
  const limit: number | "unlimited" = unlimited ? "unlimited" : FREE_INPUT_TRANSLATION_DAILY_LIMIT

  useEffect(() => {
    let cancelled = false
    getInputTranslationUsage()
      .then((n) => {
        if (!cancelled) {
          setUsed(n)
          setUsageLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fail-open for the loader — the actual gate happens in
          // checkAndIncrement which will retry the DB.
          setUsed(0)
          setUsageLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isLoading = sessionLoading || entitlementsLoading || usageLoading

  const canTranslate = !isLoading && (unlimited || used < FREE_INPUT_TRANSLATION_DAILY_LIMIT)

  const checkAndIncrement = useCallback(async (): Promise<boolean> => {
    if (sessionLoading || entitlementsLoading) {
      return false
    }
    if (unlimited) {
      try {
        const next = await incrementInputTranslationUsage()
        setUsed(next)
      }
      catch {
        // Swallow — counter is best-effort for unlimited users.
      }
      return true
    }
    try {
      const next = await incrementInputTranslationUsage()
      setUsed(next)
      return next <= FREE_INPUT_TRANSLATION_DAILY_LIMIT
    }
    catch {
      // DB unavailable — fail closed so we don't hand out free translations.
      return false
    }
  }, [sessionLoading, entitlementsLoading, unlimited])

  return { isLoading, used, limit, canTranslate, checkAndIncrement }
}
