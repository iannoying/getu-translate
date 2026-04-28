import type { KVNamespace } from "@cloudflare/workers-types"

export type RateLimitConfig = {
  limit: number
  windowMs: number  // currently always 60_000 — kept for forward-compat
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

const KV_TTL_SECONDS = 120  // 1-min window + ~60s safety buffer for KV propagation

/**
 * Fixed-window rate limit backed by Cloudflare KV.
 * Key: `rl:<key>:<minuteEpoch>`. Value: ASCII int count.
 *
 * Race note: KV is eventually consistent. Two concurrent requests on the
 * same key may both read N and both write N+1, effectively allowing one
 * extra request through. For abuse prevention this is acceptable — the
 * limit becomes a fuzzy ~limit value, not a hard cap. If precise quota
 * enforcement is needed (Stripe, billing), use the D1-backed
 * consumeQuota path instead.
 */
export async function checkAndIncrementRateLimit(
  kv: KVNamespace,
  key: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now()
  const minuteEpoch = Math.floor(now / cfg.windowMs)
  const kvKey = `rl:${key}:${minuteEpoch}`

  const raw = await kv.get(kvKey)
  const current = raw === null ? 0 : Number.parseInt(raw, 10)
  const safeCurrent = Number.isNaN(current) ? 0 : current

  if (safeCurrent >= cfg.limit) {
    const windowEndMs = (minuteEpoch + 1) * cfg.windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - now) / 1000))
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  const next = safeCurrent + 1
  await kv.put(kvKey, String(next), { expirationTtl: KV_TTL_SECONDS })
  return {
    allowed: true,
    remaining: cfg.limit - next,
    retryAfterSeconds: 0,
  }
}
