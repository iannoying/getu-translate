import { z } from "zod"
import type { D1Database } from "@cloudflare/workers-types"

/** Workers env bindings.
 *  D1 is injected as a binding (not a URL). Secrets come from `wrangler secret put`. */
export interface WorkerEnv {
  DB: D1Database
  AUTH_SECRET: string
  AUTH_BASE_URL: string
  ALLOWED_EXTENSION_ORIGINS: string
}

export const SecretsSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_BASE_URL: z.string().url(),
  ALLOWED_EXTENSION_ORIGINS: z.string(),
})

export function parseSecrets(env: WorkerEnv) {
  return SecretsSchema.parse({
    AUTH_SECRET: env.AUTH_SECRET,
    AUTH_BASE_URL: env.AUTH_BASE_URL,
    ALLOWED_EXTENSION_ORIGINS: env.ALLOWED_EXTENSION_ORIGINS,
  })
}
