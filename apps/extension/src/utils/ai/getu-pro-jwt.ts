import { WEBSITE_URL } from "@/utils/constants/url"

interface CachedJwt { token: string, expiresAt: number }
let cache: CachedJwt | null = null

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

export async function getProJwt(opts?: { force?: boolean }): Promise<string> {
  if (!opts?.force && cache && cache.expiresAt > Date.now() + 30_000) {
    return cache.token
  }
  const res = await fetch(`${getProApiBaseUrl()}/token`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok)
    throw new Error(`Pro JWT fetch failed: ${res.status}`)
  const body = await res.json() as { token: string, expires_in: number }
  cache = { token: body.token, expiresAt: Date.now() + body.expires_in * 1000 }
  return cache.token
}

/** Test-only: reset the module-level cache between tests. */
export function __clearJwtCache() {
  cache = null
}
