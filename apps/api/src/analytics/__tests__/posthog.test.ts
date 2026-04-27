import { describe, expect, it, vi } from "vitest"
import { captureEvent, MissingApiKeyError } from "../posthog"

function mockFetch(status: number, body = "{}"): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
  }) as unknown as typeof fetch
}

describe("captureEvent", () => {
  it("sends POST to PostHog capture endpoint with correct body shape", async () => {
    const fetchImpl = mockFetch(200)
    await captureEvent(
      {
        apiKey: "phc_test",
        distinctId: "user-1",
        event: "text_translate_completed",
        properties: { modelId: "google", charCount: 100 },
      },
      fetchImpl,
    )

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://us.i.posthog.com/capture/")
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({ "content-type": "application/json" })

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.api_key).toBe("phc_test")
    expect(body.event).toBe("text_translate_completed")
    expect(body.distinct_id).toBe("user-1")
    expect(body.properties).toMatchObject({ modelId: "google", charCount: 100 })
    expect(typeof body.timestamp).toBe("string")
  })

  it("uses empty object for properties when not provided", async () => {
    const fetchImpl = mockFetch(200)
    await captureEvent({ apiKey: "phc_test", distinctId: "u1", event: "test_event" }, fetchImpl)

    const body = JSON.parse(
      ((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>
    expect(body.properties).toEqual({})
  })

  it("throws MissingApiKeyError when apiKey is empty string", async () => {
    const fetchImpl = mockFetch(200)
    await expect(
      captureEvent({ apiKey: "", distinctId: "u1", event: "test_event" }, fetchImpl),
    ).rejects.toThrow(MissingApiKeyError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("throws an error on non-ok HTTP response", async () => {
    const fetchImpl = mockFetch(500)
    await expect(
      captureEvent({ apiKey: "phc_test", distinctId: "u1", event: "test_event" }, fetchImpl),
    ).rejects.toThrow("PostHog capture failed: HTTP 500")
  })

  it("throws an error on 400 response", async () => {
    const fetchImpl = mockFetch(400)
    await expect(
      captureEvent({ apiKey: "phc_test", distinctId: "u1", event: "test_event" }, fetchImpl),
    ).rejects.toThrow("PostHog capture failed: HTTP 400")
  })
})
