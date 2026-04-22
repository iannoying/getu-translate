import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"

const unixMsDefault = sql`(CAST(unixepoch('now','subsec') * 1000 AS INTEGER))`

/**
 * Per-user commercialized tier + feature flags + Stripe linkage.
 * Phase 3 populates only: userId, tier, features, expiresAt.
 * Phase 4 webhook populates: stripeCustomerId, stripeSubscriptionId, graceUntil.
 */
export const userEntitlements = sqliteTable("user_entitlements", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["free", "pro", "enterprise"] }).notNull().default("free"),
  features: text("features").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  graceUntil: integer("grace_until", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})

/**
 * Raw quota consumption log. Append-only. Idempotent via (userId, requestId).
 * Retained 30 days (cleaned by a future cron; not in Phase 3 scope).
 */
export const usageLog = sqliteTable("usage_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  bucket: text("bucket").notNull(),
  amount: integer("amount").notNull(),
  requestId: text("request_id").notNull(),
  upstreamModel: text("upstream_model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
}, t => ({
  idemp: uniqueIndex("usage_log_user_request_uidx").on(t.userId, t.requestId),
  byBucket: index("usage_log_user_bucket_idx").on(t.userId, t.bucket, t.createdAt),
}))

/**
 * Pre-aggregated quota by (user, bucket, period_key).
 *   period_key = "YYYY-MM-DD" for *_daily buckets
 *              = "YYYY-MM"    for *_monthly buckets
 *              = "lifetime"   for lifetime buckets (vocab_count)
 * Updated atomically together with usage_log inserts.
 */
export const quotaPeriod = sqliteTable("quota_period", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  bucket: text("bucket").notNull(),
  periodKey: text("period_key").notNull(),
  used: integer("used").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
}, t => ({
  pk: uniqueIndex("quota_period_pk").on(t.userId, t.bucket, t.periodKey),
}))
