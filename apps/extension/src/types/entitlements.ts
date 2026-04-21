import { z } from "zod"

/**
 * Canonical list of all billable feature keys. Keep in sync with
 * `docs/contracts/billing.md` §3.1 — adding a new key is non-breaking,
 * removing or renaming is a v2 contract change.
 */
export const FeatureKeySchema = z.enum([
  "pdf_translate",
  "input_translate_unlimited",
  "vocab_unlimited",
  "vocab_cloud_sync",
  "ai_translate_pool",
  "subtitle_platforms_extended",
  "enterprise_glossary_share",
])
export type FeatureKey = z.infer<typeof FeatureKeySchema>

export const QuotaBucketSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
})
export type QuotaBucket = z.infer<typeof QuotaBucketSchema>

export const EntitlementTierSchema = z.enum(["free", "pro", "enterprise"])
export type EntitlementTier = z.infer<typeof EntitlementTierSchema>

/**
 * The full billing-state envelope consumed by the extension. Served by
 * `billing.getEntitlements` and cached offline in the `entitlements_cache`
 * Dexie table (see Task 2).
 */
export const EntitlementsSchema = z.object({
  tier: EntitlementTierSchema,
  features: z.array(FeatureKeySchema),
  quota: z.record(z.string(), QuotaBucketSchema),
  expiresAt: z.string().datetime().nullable(),
})
export type Entitlements = z.infer<typeof EntitlementsSchema>

/**
 * True iff the entitlement envelope currently grants `feature`. Bypasses
 * any `isPro` check because backend is the source of truth for the
 * `features` array — if the feature is listed, treat it as granted.
 */
export function hasFeature(e: Entitlements, feature: FeatureKey): boolean {
  return e.features.includes(feature)
}

/**
 * True iff the user currently has an active paid plan. Accepts an
 * injectable `now` for deterministic testing.
 *
 * Defensive stance:
 * - `free` → always false
 * - `pro` with `null` expiresAt → false (invariant violation from backend;
 *   we refuse to treat it as forever-pro)
 * - `pro` with expiresAt → strict future comparison
 * - `enterprise` with `null` expiresAt → true (seat-based, backend-managed)
 * - `enterprise` with expiresAt → strict future comparison
 */
export function isPro(e: Entitlements, now: () => number = Date.now): boolean {
  if (e.tier === "free")
    return false
  if (e.expiresAt === null)
    return e.tier === "enterprise"
  return Date.parse(e.expiresAt) > now()
}

/**
 * Safe default when user is anonymous, offline, or backend is unreachable.
 * Never grants a paid feature — fail-closed by design (see
 * `docs/contracts/billing.md` §1 "Failure safety").
 */
export const FREE_ENTITLEMENTS: Entitlements = {
  tier: "free",
  features: [],
  quota: {},
  expiresAt: null,
}
