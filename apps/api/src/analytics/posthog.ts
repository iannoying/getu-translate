const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"

/** Thrown when no PostHog API key is configured. Callers decide whether to swallow or surface. */
export class MissingApiKeyError extends Error {
  constructor(message = "PostHog API key is not configured") {
    super(message)
    this.name = "MissingApiKeyError"
  }
}

export interface CaptureEventOptions {
  apiKey: string
  distinctId: string
  event: string
  properties?: Record<string, unknown>
  /** Defaults to https://us.i.posthog.com. Set to https://eu.i.posthog.com for EU residency. */
  host?: string
}

/**
 * Send a single event to PostHog via bare fetch (compatible with Cloudflare Workers).
 *
 * Callers should wrap this in `ctx.waitUntil(captureEvent(...).catch(() => {}))` so
 * the user request is not blocked on PostHog.
 */
export async function captureEvent(
  opts: CaptureEventOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!opts.apiKey || opts.apiKey.trim() === "") {
    throw new MissingApiKeyError("PostHog apiKey is empty")
  }

  const host = opts.host ?? DEFAULT_POSTHOG_HOST
  const res = await fetchImpl(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: opts.apiKey,
      event: opts.event,
      distinct_id: opts.distinctId,
      properties: opts.properties ?? {},
      timestamp: new Date().toISOString(),
    }),
  })

  if (!res.ok) {
    throw new Error(`PostHog capture failed: HTTP ${res.status}`)
  }
}
