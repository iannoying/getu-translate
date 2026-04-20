import type EntitlementsCache from "./tables/entitlements-cache"
import type { Entitlements } from "@/types/entitlements"
import { db } from "./db"

/**
 * Upsert the latest entitlements snapshot for `userId`. `updatedAt` is stamped
 * by this function so callers can stay pure.
 */
export async function writeCachedEntitlements(
  userId: string,
  value: Entitlements,
): Promise<void> {
  await db.entitlementsCache.put({
    userId,
    value,
    updatedAt: new Date(),
  })
}

/**
 * Read the last cached entitlements row for `userId`. Returns `null` when no
 * row exists (so callers can branch on `null` rather than `undefined`, which
 * is more distinguishable from `undefined`-as-missing-arg).
 */
export async function readCachedEntitlements(
  userId: string,
): Promise<EntitlementsCache | null> {
  const row = await db.entitlementsCache.get(userId)
  return row ?? null
}
