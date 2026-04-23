import { z } from "zod"
import type { D1Database } from "@cloudflare/workers-types"

/** Workers env bindings.
 *  D1 is injected as a binding (not a URL). Secrets come from `wrangler secret put`. */
export interface WorkerEnv {
  DB: D1Database
  AUTH_SECRET: string
  AUTH_BASE_URL: string
  ALLOWED_EXTENSION_ORIGINS: string
  // Phase 3: AI proxy
  BIANXIE_API_KEY: string
  BIANXIE_BASE_URL: string
  AI_JWT_SECRET: string
  // Phase 4: billing feature flag ("true" | "false")
  BILLING_ENABLED: string
  // Phase 4: paddle billing (sandbox until vendor approval; prod values come later)
  PADDLE_API_KEY: string
  PADDLE_WEBHOOK_SECRET: string
  PADDLE_PRICE_PRO_MONTHLY: string
  PADDLE_PRICE_PRO_YEARLY: string
  PADDLE_BASE_URL: string
  // Phase 5: Stripe
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  STRIPE_PRICE_PRO_MONTHLY: string
  STRIPE_PRICE_PRO_YEARLY: string
  STRIPE_BASE_URL: string
}

export const SecretsSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_BASE_URL: z.string().url(),
  ALLOWED_EXTENSION_ORIGINS: z.string(),
  BIANXIE_API_KEY: z.string().min(10),
  BIANXIE_BASE_URL: z.string().url(),
  AI_JWT_SECRET: z.string().min(32),
})

export function parseSecrets(env: WorkerEnv) {
  return SecretsSchema.parse({
    AUTH_SECRET: env.AUTH_SECRET,
    AUTH_BASE_URL: env.AUTH_BASE_URL,
    ALLOWED_EXTENSION_ORIGINS: env.ALLOWED_EXTENSION_ORIGINS,
    BIANXIE_API_KEY: env.BIANXIE_API_KEY,
    BIANXIE_BASE_URL: env.BIANXIE_BASE_URL,
    AI_JWT_SECRET: env.AI_JWT_SECRET,
  })
}
