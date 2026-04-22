import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import { FeatureKey, FREE_ENTITLEMENTS, type Entitlements, type FeatureKey as FK } from "@getu/contract"

const { userEntitlements } = schema

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
  if (!row) return { ...FREE_ENTITLEMENTS, billingEnabled }

  // expiresAt is Date (real Drizzle with mode:"timestamp_ms") or number (test fakes)
  const expiresAtMs = row.expiresAt instanceof Date
    ? row.expiresAt.getTime()
    : (row.expiresAt as number | null)
  const graceAtMs = row.graceUntil instanceof Date
    ? row.graceUntil.getTime()
    : (row.graceUntil as number | null)

  const expired = expiresAtMs != null && expiresAtMs < Date.now()
  if (row.tier === "free" || expired) return { ...FREE_ENTITLEMENTS, billingEnabled }

  const expiresAtIso = expiresAtMs != null ? new Date(expiresAtMs).toISOString() : null
  const graceUntilIso = graceAtMs != null ? new Date(graceAtMs).toISOString() : null

  return {
    tier: row.tier,
    features: parseFeatures(row.features),
    quota: {}, // Task 3 enriches this by summing quota_period rows
    expiresAt: expiresAtIso,
    graceUntil: graceUntilIso,
    billingEnabled,
    billingProvider: row.billingProvider ?? null,
  }
}
