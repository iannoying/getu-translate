import { z } from "zod"
import { oc } from "@orpc/contract"

export const FeatureKey = z.enum([
  "pdf_translate",
  "pdf_translate_unlimited",
  "input_translate_unlimited",
  "vocab_unlimited",
  "vocab_cloud_sync",
  "ai_translate_pool",
  "subtitle_platforms_extended",
  "enterprise_glossary_share",
])
export type FeatureKey = z.infer<typeof FeatureKey>

export const QuotaBucketSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
})

export const EntitlementsSchema = z.object({
  tier: z.enum(["free", "pro", "enterprise"]),
  features: z.array(FeatureKey),
  quota: z.record(z.string(), QuotaBucketSchema),
  expiresAt: z.string().datetime().nullable(),
})
export type Entitlements = z.infer<typeof EntitlementsSchema>

export const FREE_ENTITLEMENTS: Entitlements = {
  tier: "free",
  features: [],
  quota: {},
  expiresAt: null,
}

export function hasFeature(e: Entitlements, f: FeatureKey): boolean {
  return e.features.includes(f)
}

export function isPro(e: Entitlements): boolean {
  if (e.tier === "free") return false
  if (e.expiresAt == null) return e.tier === "enterprise"
  return Date.parse(e.expiresAt) > Date.now()
}

// ---- consumeQuota contract ----

export const QUOTA_BUCKETS = [
  "input_translate_daily",
  "pdf_translate_daily",
  "vocab_count",
  "ai_translate_monthly",
] as const
export type QuotaBucket = (typeof QUOTA_BUCKETS)[number]

// UUID v4/v7 accepted; 16 chars+
const requestIdSchema = z.string().min(16).max(128)

export const consumeQuotaInputSchema = z.object({
  bucket: z.enum(QUOTA_BUCKETS),
  amount: z.number().int().positive(),
  request_id: requestIdSchema,
}).strict()
export type ConsumeQuotaInput = z.infer<typeof consumeQuotaInputSchema>

export const consumeQuotaOutputSchema = z.object({
  bucket: z.enum(QUOTA_BUCKETS),
  remaining: z.number().int().nonnegative().nullable(),
  reset_at: z.string().datetime().nullable(),
})
export type ConsumeQuotaOutput = z.infer<typeof consumeQuotaOutputSchema>

/** oRPC contract — server implements, client consumes */
export const billingContract = oc.router({
  getEntitlements: oc.input(z.object({}).strict()).output(EntitlementsSchema),
  consumeQuota: oc.input(consumeQuotaInputSchema).output(consumeQuotaOutputSchema),
})
