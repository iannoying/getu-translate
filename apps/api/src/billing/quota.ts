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
    // M6 — see docs/plans/2026-04-25-web-translate-document-design.md § 配额表
    web_text_translate_monthly: 100,
    web_text_translate_token_monthly: 0,
    web_pdf_translate_monthly: 10,
  },
  pro: {
    input_translate_daily: null,
    pdf_translate_daily: null,
    vocab_count: null,
    ai_translate_monthly: 100_000,
    web_text_translate_monthly: null,
    web_text_translate_token_monthly: 2_000_000,
    web_pdf_translate_monthly: 500,
  },
  enterprise: {
    input_translate_daily: null,
    pdf_translate_daily: null,
    vocab_count: null,
    ai_translate_monthly: null,
    web_text_translate_monthly: null,
    web_text_translate_token_monthly: null,
    web_pdf_translate_monthly: null,
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
  upstreamModel?: string,
  inputTokens?: number,
  outputTokens?: number,
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

  // 3. Any bucket with limit=0 for this tier is forbidden, not just "over quota".
  // This future-proofs against new zero-limit buckets (e.g. future Pro-only features).
  if (lim === 0) {
    throw new ORPCError("FORBIDDEN", {
      message: `Tier '${tier}' cannot access bucket '${bucket}'`,
    })
  }

  // 4. Capacity check
  // NOTE: optimistic capacity check — not atomic with the write. Two concurrent
  // consumeQuota calls with different request_ids may both observe used=0,
  // both pass this guard, and both commit, overshooting `lim` by up to
  // `concurrency * amount`. Accepted trade-off for Phase 3:
  //   - AI-proxy usage is post-hoc accounting; charges happen AFTER the LLM
  //     work is done, so blocking serialization on the critical path would
  //     hurt latency for dubious benefit.
  //   - Per-user concurrency is low (1-5 active translations typical); overshoot
  //     bounded by model_cap × concurrency, not catastrophic.
  //   - Zero-overshoot enforcement would require D1 Durable Objects or KV CAS,
  //     which are Phase 4+ scope per the plan's Risk Register.
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

  // 5. Atomic write: insert usage_log + upsert quota_period.
  // D1 db.batch runs all statements in a single transaction — either all
  // commit or all roll back. If the usageLog insert throws a UNIQUE violation
  // (concurrent replay with the same request_id), the quotaPeriod upsert is
  // also reverted, preventing ghost quota consumption.
  // See: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
  // Drizzle wires this directly to the native D1 client.batch() (d1/session.js:51).
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(usageLog).values({ id, userId, bucket, amount, requestId, upstreamModel, inputTokens, outputTokens, createdAt: now }),
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
