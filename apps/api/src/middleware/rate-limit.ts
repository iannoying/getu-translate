import type { Context, MiddlewareHandler } from "hono"
import type { KVNamespace } from "@cloudflare/workers-types"
import { checkAndIncrementRateLimit } from "./rate-limit-core"
import { logger } from "../analytics/logger"

export type RateLimitMiddlewareOptions = {
  /** Per-minute cap for authenticated requests (session.user.id present). */
  limitAuth: number
  /** Per-minute cap for anonymous requests (keyed by CF-Connecting-IP / XFF). */
  limitAnon: number
}

type RequiredEnv = {
  RATE_LIMIT_KV?: KVNamespace
  RATE_LIMIT_SMOKE_SECRET?: string
}

type RequiredVariables = {
  session: { user: { id: string } } | null
}

function resolveAnonymousKey(c: Context): string {
  const cfIp = c.req.header("cf-connecting-ip")
  if (cfIp) return `ip:${cfIp.trim()}`
  const xff = c.req.header("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return `ip:${first}`
  }
  return "ip:unknown"
}

export function rateLimit(opts: RateLimitMiddlewareOptions): MiddlewareHandler<{
  Bindings: RequiredEnv
  Variables: RequiredVariables
}> {
  return async (c, next) => {
    // Smoke-test escape hatch: closed-by-default — only bypasses if the
    // operator has explicitly set RATE_LIMIT_SMOKE_SECRET in the env AND
    // the request presents the matching header value.
    const smokeSecret = c.env.RATE_LIMIT_SMOKE_SECRET
    if (smokeSecret && c.req.header("x-internal-smoke") === smokeSecret) {
      return next()
    }

    // Fail-open if the binding is missing — never 500 the whole worker
    // because of a misconfigured rate limiter. Log loudly so ops sees it.
    const kv = c.env.RATE_LIMIT_KV
    if (!kv) {
      logger.warn("[rate-limit] RATE_LIMIT_KV binding missing — failing open. Configure wrangler.toml.")
      return next()
    }

    const session = c.get("session")
    const isAuthed = !!session?.user
    const key = isAuthed ? `user:${session!.user.id}` : resolveAnonymousKey(c)
    const limit = isAuthed ? opts.limitAuth : opts.limitAnon

    const result = await checkAndIncrementRateLimit(kv, key, {
      limit,
      windowMs: 60_000,
    })

    if (!result.allowed) {
      return c.json(
        {
          error: `rate limit exceeded: ${limit} req/min`,
          code: "RATE_LIMITED",
        },
        429,
        { "retry-after": String(result.retryAfterSeconds) },
      )
    }
    return next()
  }
}
