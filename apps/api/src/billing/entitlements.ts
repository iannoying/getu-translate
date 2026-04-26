import { and, eq, inArray } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import { FeatureKey, FREE_ENTITLEMENTS, type Entitlements, type FeatureKey as FK } from "@getu/contract"
import { QUOTA_LIMITS } from "./quota"
import { periodKey } from "./period"

const { userEntitlements, quotaPeriod } = schema

// The 3 web translate buckets enriched in M6.7.
// M6.8 may add more; extend this array when needed.
const WEB_TRANSLATE_BUCKETS = [
  "web_text_translate_monthly",
  "web_text_translate_token_monthly",
  "web_pdf_translate_monthly",
] as const

// Sentinel value for unlimited quotas. Contract QuotaBucketSchema requires
// `limit` to be a nonnegative integer; we use Number.MAX_SAFE_INTEGER (2^53 - 1)
// to represent "no enforced limit" without changing the schema. Consumers that
// want to show "∞" should check `limit >= Number.MAX_SAFE_INTEGER`.
const UNLIMITED_SENTINEL = Number.MAX_SAFE_INTEGER

function parseFeatures(raw: string): FK[] {
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is FK => FeatureKey.safeParse(x).success)
  } catch {
    return []
  }
}

export async function loadEntitlements(
  db: Db,
  userId: string,
  billingEnabled: boolean,
): Promise<Entitlements> {
  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  if (!row) return enrichWithQuota(db, userId, "free", { ...FREE_ENTITLEMENTS, billingEnabled })

  // expiresAt is Date (real Drizzle with mode:"timestamp_ms") or number (test fakes)
  const expiresAtMs = row.expiresAt instanceof Date
    ? row.expiresAt.getTime()
    : (row.expiresAt as number | null)
  const graceAtMs = row.graceUntil instanceof Date
    ? row.graceUntil.getTime()
    : (row.graceUntil as number | null)

  const expired = expiresAtMs != null && expiresAtMs < Date.now()
  if (row.tier === "free" || expired) return enrichWithQuota(db, userId, "free", { ...FREE_ENTITLEMENTS, billingEnabled })

  const expiresAtIso = expiresAtMs != null ? new Date(expiresAtMs).toISOString() : null
  const graceUntilIso = graceAtMs != null ? new Date(graceAtMs).toISOString() : null

  const tier = row.tier as "pro" | "enterprise"
  const base: Entitlements = {
    tier,
    features: parseFeatures(row.features),
    quota: {},
    expiresAt: expiresAtIso,
    graceUntil: graceUntilIso,
    billingEnabled,
    billingProvider: row.billingProvider ?? null,
  }
  return enrichWithQuota(db, userId, tier, base)
}

/**
 * Reads current-month `quota_period` rows for the 3 web translate buckets and
 * merges them into `base.quota`. Missing rows → used = 0.
 * QUOTA_LIMITS[tier][bucket] === null means unlimited → stored as UNLIMITED_SENTINEL.
 */
async function enrichWithQuota(
  db: Db,
  userId: string,
  tier: "free" | "pro" | "enterprise",
  base: Entitlements,
): Promise<Entitlements> {
  const now = new Date()
  // All 3 buckets are monthly, so they share the same period key.
  const pk = periodKey("web_text_translate_monthly", now)

  const rows = await db
    .select()
    .from(quotaPeriod)
    .where(
      and(
        eq(quotaPeriod.userId, userId),
        inArray(quotaPeriod.bucket, [...WEB_TRANSLATE_BUCKETS]),
        eq(quotaPeriod.periodKey, pk),
      ),
    )
    .all()

  const usedByBucket = new Map(rows.map(r => [r.bucket, r.used]))

  const quota: Entitlements["quota"] = { ...base.quota }
  for (const bucket of WEB_TRANSLATE_BUCKETS) {
    const rawLimit = QUOTA_LIMITS[tier][bucket]
    const limit = rawLimit == null ? UNLIMITED_SENTINEL : rawLimit
    quota[bucket] = { used: usedByBucket.get(bucket) ?? 0, limit }
  }

  return { ...base, quota }
}
