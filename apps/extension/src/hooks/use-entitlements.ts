import type { Entitlements } from "@/types/entitlements"
import { useQuery } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { useEffect } from "react"
import { EntitlementsSchema, FREE_ENTITLEMENTS, isPro } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { fetchEntitlementsFromBackend } from "@/utils/billing/fetch-entitlements"
import { readCachedEntitlements, writeCachedEntitlements } from "@/utils/db/dexie/entitlements"
import { logger } from "@/utils/logger"

/** Reject cache rows older than this to prevent perpetually-stale entitlements. */
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface UseEntitlementsResult {
  data: Entitlements
  isLoading: boolean
  isFromCache: boolean
}

interface EntitlementsQueryResult {
  data: Entitlements
  isFromCache: boolean
}

/**
 * Classify a thrown error as an "identity" error (401/403 — wrong or missing
 * session) vs. an "infrastructure" error (network, 5xx, parse). Only the
 * latter should consult the offline cache.
 */
function isIdentityError(err: unknown): boolean {
  if (err == null || typeof err !== "object")
    return false
  const code = (err as { code?: unknown }).code
  if (typeof code === "string" && (code === "UNAUTHORIZED" || code === "UNAUTHENTICATED" || code === "FORBIDDEN"))
    return true
  const status = (err as { status?: unknown }).status
  if (typeof status === "number" && (status === 401 || status === 403))
    return true
  return false
}

async function readValidCachedFallback(userId: string): Promise<EntitlementsQueryResult> {
  const cached = await readCachedEntitlements(userId)
  if (cached !== null) {
    // Defense in depth: re-validate cache through schema (IndexedDB could be
    // corrupted or tampered with), apply TTL, and fail-closed on expired tiers.
    const parsed = EntitlementsSchema.safeParse(cached.value)
    if (parsed.success) {
      const ageMs = Date.now() - cached.updatedAt.getTime()
      const isExpired = ageMs >= MAX_CACHE_AGE_MS
      const isTierValid = parsed.data.tier === "free" || isPro(parsed.data)
      if (!isExpired && isTierValid) {
        return { data: parsed.data, isFromCache: true }
      }
    }
  }
  return { data: FREE_ENTITLEMENTS, isFromCache: false }
}

async function queryEntitlements(userId: string): Promise<EntitlementsQueryResult> {
  try {
    const raw = await fetchEntitlementsFromBackend()
    const parsed = EntitlementsSchema.parse(raw)
    try {
      await writeCachedEntitlements(userId, parsed)
    }
    catch (cacheErr) {
      logger.warn("[billing] cache write failed", cacheErr) // don't let it downgrade user
    }
    return { data: parsed, isFromCache: false }
  }
  catch (err) {
    logger.warn("[billing] getEntitlements failed", err)
    if (isIdentityError(err)) {
      // Session is wrong/missing. Never serve another identity's cached data.
      return { data: FREE_ENTITLEMENTS, isFromCache: false }
    }
    // Infra error: try cache.
    return readValidCachedFallback(userId)
  }
}

/**
 * Returns the current user's entitlements.
 *
 * - When `userId` is `null` (user not signed in), returns FREE_ENTITLEMENTS
 *   synchronously without firing any network request.
 * - When `userId` is provided, fetches from the backend (30s staleTime per
 *   billing.md contract Cache-Control: private, max-age=30).
 *   On success the result is written to Dexie and the Jotai atom.
 *   On a 401/403 identity error, FREE_ENTITLEMENTS is returned immediately
 *   without consulting the cache (to prevent identity bleed).
 *   On infrastructure errors the hook falls back to the Dexie offline cache;
 *   if that also misses it returns FREE_ENTITLEMENTS. Both fallback paths are
 *   fail-closed (no paid features granted).
 */
export function useEntitlements(
  userId: string | null,
): UseEntitlementsResult {
  const setEntitlements = useSetAtom(entitlementsAtom)

  const query = useQuery({
    queryKey: ["entitlements", userId] as const,
    enabled: userId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: ({ queryKey: [, uid] }) => queryEntitlements(uid as string),
    // Suppress the global QueryCache toast — we handle errors with cache fallback.
    meta: { suppressToast: true },
  })

  // Sync successful fetch result into the global Jotai atom — only when the
  // data comes directly from the backend (not a cache fallback).
  useEffect(() => {
    if (query.data != null && !query.data.isFromCache) {
      setEntitlements(query.data.data)
    }
  }, [query.data, setEntitlements])

  if (userId === null) {
    return { data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false }
  }

  if (query.isLoading) {
    return { data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false }
  }

  return {
    data: query.data?.data ?? FREE_ENTITLEMENTS,
    isLoading: false,
    isFromCache: query.data?.isFromCache ?? false,
  }
}
