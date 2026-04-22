import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"

const unixMsDefault = sql`(CAST(unixepoch('now','subsec') * 1000 AS INTEGER))`

/**
 * Per-user commercialized tier + feature flags + billing provider linkage.
 * Phase 3 populates only: userId, tier, features, expiresAt.
 * Phase 4 webhook populates: providerCustomerId, providerSubscriptionId, billingProvider, graceUntil.
 */
export const userEntitlements = sqliteTable("user_entitlements", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["free", "pro", "enterprise"] }).notNull().default("free"),
  features: text("features").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  billingProvider: text("billing_provider", { enum: ["paddle", "stripe"] }),
  graceUntil: integer("grace_until", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})

/**
 * Raw quota consumption log. Append-only. Idempotent via (userId, requestId).
 * Retained 30 days (cleaned by a future cron; not in Phase 3 scope).
 * userId is nullable + SET NULL (not CASCADE) to preserve the billing audit trail
 * even if a user account is deleted.
 */
export const usageLog = sqliteTable("usage_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
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
  // NOTE: SQLite has no ON UPDATE trigger. UPSERT callers MUST set updatedAt
  // in the `.set({ ... })` clause explicitly, or this column will freeze at insertion time.
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
}, t => ({
  pk: uniqueIndex("quota_period_pk").on(t.userId, t.bucket, t.periodKey),
}))

/**
 * Webhook event idempotency + audit log.
 * event_id is the provider's own event ID (e.g. Paddle's evt_*).
 * Deduplication: INSERT OR IGNORE / ON CONFLICT DO NOTHING on event_id PK.
 */
export const billingWebhookEvents = sqliteTable("billing_webhook_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider", { enum: ["paddle", "stripe"] }).notNull(),
  eventType: text("event_type").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  status: text("status", { enum: ["received", "processed", "error"] }).notNull().default("received"),
  errorMessage: text("error_message"),
  payloadJson: text("payload_json").notNull(),
}, t => ({
  byReceivedAt: index("billing_webhook_events_received_at_idx").on(t.receivedAt),
}))
