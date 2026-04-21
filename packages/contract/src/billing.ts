import { z } from "zod"
import { oc } from "@orpc/contract"

export const FeatureKey = z.enum([
  "pdf_translate",
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

/** oRPC contract — server implements, client consumes */
export const billingContract = oc.router({
  getEntitlements: oc
    .input(z.object({}).strict())
    .output(EntitlementsSchema),
})
