import { WEBSITE_URL } from "@/utils/constants/url"

export type ProAiQuotaBucket = "ai_translate_monthly" | "web_text_translate_token_monthly"

interface CachedJwt { token: string, expiresAt: number }
const cacheByBucket = new Map<ProAiQuotaBucket, CachedJwt>()
const inflightByBucket = new Map<ProAiQuotaBucket, Promise<string>>()

export function getProApiBaseUrl(): string {
  const url = new URL(WEBSITE_URL)
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    // Dev: API is on port 8788 (wrangler dev)
    return `${url.protocol}//${url.hostname}:8788/ai/v1`
  }
  // Prod: prepend api.
  const host = url.hostname.startsWith("www.") ? url.hostname.slice(4) : url.hostname
  return `${url.protocol}//api.${host}/ai/v1`
}

export async function getProJwt(opts?: { force?: boolean, quotaBucket?: ProAiQuotaBucket }): Promise<string> {
  const quotaBucket = opts?.quotaBucket ?? "ai_translate_monthly"
  const cache = cacheByBucket.get(quotaBucket)
  if (!opts?.force && cache && cache.expiresAt > Date.now() + 30_000) {
    return cache.token
  }
  const inflight = inflightByBucket.get(quotaBucket)
  if (!opts?.force && inflight)
    return inflight
  const nextInflight = (async () => {
    try {
      const res = await fetch(`${getProApiBaseUrl()}/token`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quota_bucket: quotaBucket }),
      })
      if (!res.ok)
        throw new Error(`Pro JWT fetch failed: ${res.status}`)
      const body = await res.json() as { token: string, expires_in: number }
      const nextCache = { token: body.token, expiresAt: Date.now() + body.expires_in * 1000 }
      cacheByBucket.set(quotaBucket, nextCache)
      return nextCache.token
    }
    finally {
      inflightByBucket.delete(quotaBucket)
    }
  })()
  inflightByBucket.set(quotaBucket, nextInflight)
  return nextInflight
}

/** Test-only: reset the module-level cache between tests. */
export function __clearJwtCache() {
  cacheByBucket.clear()
  inflightByBucket.clear()
}
