import { ORPCError } from "@orpc/server"
import { and, eq, sql } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { QuotaBucket, ConsumeQuotaOutput } from "@getu/contract"
import { periodKey, periodResetIso } from "./period"

const { userEntitlements, usageLog, quotaPeriod } = schema

export const QUOTA_LIMITS = {
  free: {
    input_translate_daily: 50,
    pdf_translate_daily: 50,
    vocab_count: 100,
    ai_translate_monthly: 0,
  },
  pro: {
    input_translate_daily: null,
    pdf_translate_daily: null,
    vocab_count: null,
    ai_translate_monthly: 100_000,
  },
  enterprise: {
    input_translate_daily: null,
    pdf_translate_daily: null,
    vocab_count: null,
    ai_translate_monthly: null,
  },
} as const satisfies Record<"free" | "pro" | "enterprise", Record<QuotaBucket, number | null>>

function resolveTier(
  ent: { tier?: string; expiresAt?: Date | null } | undefined,
  now: Date,
): "free" | "pro" | "enterprise" {
  if (!ent) return "free"
  if (ent.expiresAt && ent.expiresAt.getTime() < now.getTime()) return "free"
  return (ent.tier as "free" | "pro" | "enterprise") ?? "free"
}

export async function consumeQuota(
  db: Db,
  userId: string,
  bucket: QuotaBucket,
  amount: number,
  requestId: string,
  now: Date = new Date(),
): Promise<ConsumeQuotaOutput> {
  // 1. Idempotency: has (userId, requestId) been seen?
  const existing = await db
    .select()
    .from(usageLog)
    .where(and(eq(usageLog.userId, userId), eq(usageLog.requestId, requestId)))
    .get()

  if (existing) {
    const pk = periodKey(bucket, now)
    const period = await db
      .select()
      .from(quotaPeriod)
      .where(
        and(
          eq(quotaPeriod.userId, userId),
          eq(quotaPeriod.bucket, bucket),
          eq(quotaPeriod.periodKey, pk),
        ),
      )
      .get()
    const ent = await db
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, userId))
      .get()
    const tier = resolveTier(ent, now)
    const lim = QUOTA_LIMITS[tier][bucket]
    const used = period?.used ?? 0
    return {
      bucket,
      remaining: lim == null ? null : Math.max(0, lim - used),
      reset_at: periodResetIso(bucket, now),
    }
  }

  // 2. Resolve tier
  const ent = await db
    .select()
    .from(userEntitlements)
    .where(eq(userEntitlements.userId, userId))
    .get()
  const tier = resolveTier(ent, now)
  const lim = QUOTA_LIMITS[tier][bucket]

  // 3. Free tier forbidden from ai_translate_monthly (limit=0 semantic → FORBIDDEN)
  if (tier === "free" && bucket === "ai_translate_monthly") {
    throw new ORPCError("FORBIDDEN", {
      message: "Free tier cannot access ai_translate_monthly",
    })
  }

  // 4. Capacity check
  const pk = periodKey(bucket, now)
  const period = await db
    .select()
    .from(quotaPeriod)
    .where(
      and(
        eq(quotaPeriod.userId, userId),
        eq(quotaPeriod.bucket, bucket),
        eq(quotaPeriod.periodKey, pk),
      ),
    )
    .get()
  const used = period?.used ?? 0
  if (lim != null && used + amount > lim) {
    throw new ORPCError("QUOTA_EXCEEDED", {
      message: `Bucket ${bucket} exceeded: used=${used}, amount=${amount}, limit=${lim}`,
    })
  }

  // 5. Atomic write: insert usage_log + upsert quota_period
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(usageLog).values({ id, userId, bucket, amount, requestId, createdAt: now }),
    db
      .insert(quotaPeriod)
      .values({ userId, bucket, periodKey: pk, used: amount, updatedAt: now })
      .onConflictDoUpdate({
        target: [quotaPeriod.userId, quotaPeriod.bucket, quotaPeriod.periodKey],
        set: { used: sql`${quotaPeriod.used} + ${amount}`, updatedAt: now },
      }),
  ])

  return {
    bucket,
    remaining: lim == null ? null : lim - (used + amount),
    reset_at: periodResetIso(bucket, now),
  }
}
