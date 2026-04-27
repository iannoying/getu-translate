const POSTHOG_HOST = "https://us.i.posthog.com"

/** Thrown when no PostHog API key is configured. Callers decide whether to swallow or surface. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("PostHog API key is not configured")
    this.name = "MissingApiKeyError"
  }
}

export interface CaptureEventOptions {
  apiKey: string
  distinctId: string
  event: string
  properties?: Record<string, unknown>
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
  if (!opts.apiKey) {
    throw new MissingApiKeyError()
  }

  const res = await fetchImpl(`${POSTHOG_HOST}/capture/`, {
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
