import { z } from "zod"
import type { D1Database, Queue, R2Bucket } from "@cloudflare/workers-types"

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
  // M6.8 — PDF translation: R2 bucket + queue producer.
  // Both optional so dev / vitest with no binding falls back gracefully
  // (presign endpoint returns 503; documentCreate keeps client page count
  // and skips enqueue with a console.warn).
  BUCKET_PDFS?: R2Bucket
  TRANSLATE_QUEUE?: Queue<{ jobId: string }>
  // M6.8 — R2 S3-compatible credentials for browser presigned PUT.
  // Provisioned out-of-band via `wrangler secret put R2_ACCESS_KEY_ID` etc.
  // Without these the presign endpoint returns 503 — staging/dev fallback.
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_PDFS_NAME?: string
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
  STRIPE_PRICE_CNY_MONTHLY: string
  STRIPE_PRICE_CNY_YEARLY: string
  STRIPE_BASE_URL: string
  // Phase 5: OAuth social providers (optional — set via wrangler secret put)
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  // Phase 6: passwordless (email OTP via Resend) + passkeys (WebAuthn)
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  WEBAUTHN_RP_ID?: string
  WEBAUTHN_ORIGINS?: string
  // M6.13 — analytics & error capture
  POSTHOG_PROJECT_KEY?: string
  SENTRY_DSN?: string
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

/** Resolve WebAuthn relying-party config.
 *  rpID defaults to "localhost" so dev works without setup; prod must set WEBAUTHN_RP_ID.
 *  origin list defaults to ALLOWED_EXTENSION_ORIGINS minus the chrome-extension entries. */
export function parseWebauthnConfig(env: WorkerEnv): { rpID: string; rpName: string; origin: string[] } {
  const rpID = env.WEBAUTHN_RP_ID ?? "localhost"
  const rpName = "GetU Translate"
  const origin = (env.WEBAUTHN_ORIGINS ?? env.ALLOWED_EXTENSION_ORIGINS)
    .split(",")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("chrome-extension://"))
  return { rpID, rpName, origin }
}
