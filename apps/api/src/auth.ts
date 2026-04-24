import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { emailOTP } from "better-auth/plugins"
import { passkey } from "@better-auth/passkey"
import { createDb, schema } from "@getu/db"
import type { WorkerEnv } from "./env"
import { parseSecrets, parseWebauthnConfig } from "./env"
import { renderOtpEmail, sendEmail } from "./email"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authCache = new WeakMap<WorkerEnv, any>()

export function createAuth(env: WorkerEnv) {
  const cached = authCache.get(env)
  if (cached) return cached
  const secrets = parseSecrets(env)
  const db = createDb(env.DB)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socialProviders: Record<string, any> = {}
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    }
  }

  const webauthn = parseWebauthnConfig(env)

  const plugins = [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 5,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const { subject, html, text } = renderOtpEmail(otp, type)
        await sendEmail(env, { to: email, subject, html, text })
      },
    }),
    passkey({
      rpID: webauthn.rpID,
      rpName: webauthn.rpName,
      origin: webauthn.origin,
    }),
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: Record<string, any> = {
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
        sessionToken: {
          attributes: {
            domain: ".getutranslate.com",
            sameSite: "lax",
            secure: secrets.AUTH_BASE_URL.startsWith("https"),
          },
        },
      },
    },
    trustedOrigins: secrets.ALLOWED_EXTENSION_ORIGINS.split(",").map(s => s.trim()).filter(Boolean),
    plugins,
  }
  if (Object.keys(socialProviders).length > 0) {
    config.socialProviders = socialProviders
  }

  const auth = betterAuth(config)
  authCache.set(env, auth)
  return auth
}
