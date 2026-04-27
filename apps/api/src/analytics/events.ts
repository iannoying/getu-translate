import { captureEvent } from "./posthog"

export type EventName =
  | "text_translate_completed"
  | "pdf_uploaded"
  | "pdf_completed"
  | "pro_upgrade_triggered"

export type AnalyticsContext = {
  /** Authenticated user id, or null for anonymous. */
  userId: string | null
  apiKey: string
  fetchImpl?: typeof fetch
}

export async function trackTextTranslateCompleted(
  ctx: AnalyticsContext,
  props: { modelId: string; charCount: number; durationMs: number },
): Promise<void> {
  await captureEvent(
    {
      apiKey: ctx.apiKey,
      distinctId: ctx.userId ?? "anonymous",
      event: "text_translate_completed",
      properties: props,
    },
    ctx.fetchImpl,
  )
}

export async function trackPdfUploaded(
  ctx: AnalyticsContext,
  props: { pageCount: number; fileSizeBytes: number },
): Promise<void> {
  await captureEvent(
    {
      apiKey: ctx.apiKey,
      distinctId: ctx.userId ?? "anonymous",
      event: "pdf_uploaded",
      properties: props,
    },
    ctx.fetchImpl,
  )
}

export async function trackPdfCompleted(
  ctx: AnalyticsContext,
  props: { jobId: string; pageCount: number; durationMs: number },
): Promise<void> {
  await captureEvent(
    {
      apiKey: ctx.apiKey,
      distinctId: ctx.userId ?? "anonymous",
      event: "pdf_completed",
      properties: props,
    },
    ctx.fetchImpl,
  )
}

export async function trackProUpgradeTriggered(
  ctx: AnalyticsContext,
  props: { plan: string; provider: string },
): Promise<void> {
  await captureEvent(
    {
      apiKey: ctx.apiKey,
      distinctId: ctx.userId ?? "anonymous",
      event: "pro_upgrade_triggered",
      properties: props,
    },
    ctx.fetchImpl,
  )
}
