import { orpcClient } from "@/lib/orpc-client"

export type AnalyticsEvent =
  | "text_translate_completed"
  | "pdf_uploaded"
  | "pdf_completed"
  | "pro_upgrade_triggered"

export type AnalyticsProperties = Record<string, string | number | boolean | null>

/**
 * Fire-and-forget analytics event. Errors are logged to console only — never thrown.
 * Anonymous users (orpc 401s) are silently no-op'd.
 */
export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
  // Don't await — UX must not block on analytics
  orpcClient.analytics.track({ event, properties }).catch((err) => {
    // Anonymous users get 401 — that's expected, suppress
    if (err?.code === "UNAUTHORIZED" || err?.data?.code === "UNAUTHORIZED") return
    // eslint-disable-next-line no-console -- analytics errors should be visible in dev
    console.warn(`[analytics.${event}] failed:`, err)
  })
}
