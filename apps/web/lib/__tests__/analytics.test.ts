import { beforeEach, describe, expect, it, vi } from "vitest"

const { trackMock, warnMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  warnMock: vi.fn(),
}))

vi.mock("@/lib/orpc-client", () => ({
  orpcClient: {
    analytics: {
      track: trackMock,
    },
  },
}))

vi.stubGlobal("console", { warn: warnMock })

const { track } = await import("../analytics")

describe("track()", () => {
  beforeEach(() => {
    trackMock.mockReset()
    warnMock.mockReset()
  })

  it("does not throw when orpc succeeds", async () => {
    trackMock.mockResolvedValueOnce({ ok: true })
    expect(() => track("pro_upgrade_triggered", { source: "free_quota_exceeded" })).not.toThrow()
    await vi.waitFor(() => expect(trackMock).toHaveBeenCalledOnce())
  })

  it("calls orpc with the correct event and properties", async () => {
    trackMock.mockResolvedValueOnce({ ok: true })
    track("text_translate_completed", { modelId: "google", charCount: 100, durationMs: 500 })
    await vi.waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith({
        event: "text_translate_completed",
        properties: { modelId: "google", charCount: 100, durationMs: 500 },
      }),
    )
  })

  it("suppresses UNAUTHORIZED errors silently (anonymous users)", async () => {
    const err = { code: "UNAUTHORIZED" }
    trackMock.mockRejectedValueOnce(err)
    track("pdf_uploaded", {})
    await vi.waitFor(() => expect(trackMock).toHaveBeenCalledOnce())
    // console.warn must NOT be called for UNAUTHORIZED
    expect(warnMock).not.toHaveBeenCalled()
  })

  it("suppresses UNAUTHORIZED errors from err.data.code", async () => {
    const err = { data: { code: "UNAUTHORIZED" } }
    trackMock.mockRejectedValueOnce(err)
    track("pdf_completed", { jobId: "j1", durationMs: 1000 })
    await vi.waitFor(() => expect(trackMock).toHaveBeenCalledOnce())
    expect(warnMock).not.toHaveBeenCalled()
  })

  it("console.warns for non-auth errors", async () => {
    const err = new Error("server error")
    trackMock.mockRejectedValueOnce(err)
    track("pdf_uploaded", {})
    await vi.waitFor(() => expect(warnMock).toHaveBeenCalledOnce())
    expect(warnMock.mock.calls[0][0]).toContain("[analytics.pdf_uploaded]")
  })
})
