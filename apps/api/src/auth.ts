import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createDb, schema } from "@getu/db"
import type { WorkerEnv } from "./env"
import { parseSecrets } from "./env"

export function createAuth(env: WorkerEnv) {
  const secrets = parseSecrets(env)
  const db = createDb(env.DB)
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: secrets.AUTH_SECRET,
    baseURL: secrets.AUTH_BASE_URL,
    basePath: "/api/identity",
    emailAndPassword: { enabled: true },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    advanced: {
      cookies: {
        sessionToken: { attributes: { domain: ".getutranslate.com", sameSite: "lax", secure: true } },
      },
    },
    trustedOrigins: secrets.ALLOWED_EXTENSION_ORIGINS.split(",").map(s => s.trim()),
  })
}
