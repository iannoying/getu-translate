import type { Entitlements } from "@/types/entitlements"
import { Entity } from "dexie"

/**
 * Offline cache of `Entitlements` keyed by `userId`. One row per user; the
 * row is overwritten on every successful `billing.getEntitlements` response.
 *
 * Used as a fallback by the forthcoming `useEntitlements` hook when the
 * backend is unreachable (see `docs/contracts/billing.md` §4.1).
 */
export default class EntitlementsCache extends Entity {
  userId!: string
  value!: Entitlements
  updatedAt!: Date
}
