import { describe, expect, it, vi } from "vitest"
import {
  trackTextTranslateCompleted,
  trackPdfUploaded,
  trackPdfCompleted,
  trackProUpgradeTriggered,
} from "../events"

function mockFetch(status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({ ok: true, status }) as unknown as typeof fetch
}

function capturedBody(fetchImpl: typeof fetch): Record<string, unknown> {
  const body = ((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1]
    .body as string
  return JSON.parse(body) as Record<string, unknown>
}

const baseCtx = { userId: "u1", apiKey: "phc_test" }

describe("trackTextTranslateCompleted", () => {
  it("sends correct event name and properties", async () => {
    const fetchImpl = mockFetch()
    await trackTextTranslateCompleted(
      { ...baseCtx, fetchImpl },
      { modelId: "google", charCount: 50, durationMs: 120 },
    )
    const body = capturedBody(fetchImpl)
    expect(body.event).toBe("text_translate_completed")
    expect(body.distinct_id).toBe("u1")
    expect(body.properties).toMatchObject({ modelId: "google", charCount: 50, durationMs: 120 })
  })

  it("uses 'anonymous' as distinct_id when userId is null", async () => {
    const fetchImpl = mockFetch()
    await trackTextTranslateCompleted(
      { userId: null, apiKey: "phc_test", fetchImpl },
      { modelId: "microsoft", charCount: 10, durationMs: 80 },
    )
    expect(capturedBody(fetchImpl).distinct_id).toBe("anonymous")
  })
})

describe("trackPdfUploaded", () => {
  it("sends correct event name and properties", async () => {
    const fetchImpl = mockFetch()
    await trackPdfUploaded({ ...baseCtx, fetchImpl }, { pageCount: 5, fileSizeBytes: 204800 })
    const body = capturedBody(fetchImpl)
    expect(body.event).toBe("pdf_uploaded")
    expect(body.properties).toMatchObject({ pageCount: 5, fileSizeBytes: 204800 })
  })
})

describe("trackPdfCompleted", () => {
  it("sends correct event name and properties", async () => {
    const fetchImpl = mockFetch()
    await trackPdfCompleted(
      { ...baseCtx, fetchImpl },
      { jobId: "job-1", pageCount: 3, durationMs: 5000 },
    )
    const body = capturedBody(fetchImpl)
    expect(body.event).toBe("pdf_completed")
    expect(body.properties).toMatchObject({ jobId: "job-1", pageCount: 3, durationMs: 5000 })
  })
})

describe("trackProUpgradeTriggered", () => {
  it("sends correct event name and properties", async () => {
    const fetchImpl = mockFetch()
    await trackProUpgradeTriggered(
      { ...baseCtx, fetchImpl },
      { plan: "pro_monthly", provider: "stripe" },
    )
    const body = capturedBody(fetchImpl)
    expect(body.event).toBe("pro_upgrade_triggered")
    expect(body.properties).toMatchObject({ plan: "pro_monthly", provider: "stripe" })
  })
})
