import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRouterClient } from "@orpc/server"
import { router } from "../index"
import type { Ctx } from "../context"

vi.mock("../../analytics/posthog", () => ({
  captureEvent: vi.fn().mockResolvedValue(undefined),
}))

const mockWaitUntil = vi.fn()
const mockExecutionCtx = { waitUntil: mockWaitUntil } as unknown as ExecutionContext

function ctx(session: Ctx["session"], envOverrides: Partial<Ctx["env"]> = {}): Ctx {
  return {
    env: { DB: {} as any, BILLING_ENABLED: "false", ...envOverrides } as Ctx["env"],
    auth: {} as Ctx["auth"],
    session,
    executionCtx: mockExecutionCtx,
  }
}

const authedSession = { user: { id: "u-1", email: "u@x.com" }, session: { id: "s1" } } as any

beforeEach(() => {
  vi.clearAllMocks()
})

describe("analytics.track", () => {
  it("rejects anonymous callers", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(
      client.analytics.track({ event: "text_translate_completed" }),
    ).rejects.toThrow()
  })

  it("returns { ok: true } for authenticated user", async () => {
    const client = createRouterClient(router, { context: ctx(authedSession) })
    const result = await client.analytics.track({ event: "text_translate_completed" })
    expect(result).toEqual({ ok: true })
  })

  it("does not call captureEvent when POSTHOG_PROJECT_KEY is absent", async () => {
    const { captureEvent } = await import("../../analytics/posthog")
    const client = createRouterClient(router, { context: ctx(authedSession) })
    await client.analytics.track({ event: "pdf_uploaded" })
    // waitUntil never called — no PostHog key
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("fires captureEvent via waitUntil when POSTHOG_PROJECT_KEY is set", async () => {
    const { captureEvent } = await import("../../analytics/posthog")
    const client = createRouterClient(router, {
      context: ctx(authedSession, { POSTHOG_PROJECT_KEY: "phc_test" }),
    })
    await client.analytics.track({
      event: "text_translate_completed",
      properties: { modelId: "google", charCount: 50 },
    })

    expect(mockWaitUntil).toHaveBeenCalledOnce()
    // Resolve the waitUntil promise to trigger the captureEvent call
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "phc_test",
        distinctId: "u-1",
        event: "text_translate_completed",
        properties: expect.objectContaining({ modelId: "google", charCount: 50 }),
      }),
    )
  })

  it("uses authenticated user id as distinctId", async () => {
    const { captureEvent } = await import("../../analytics/posthog")
    const session = { user: { id: "user-abc" }, session: { id: "s2" } } as any
    const client = createRouterClient(router, {
      context: ctx(session, { POSTHOG_PROJECT_KEY: "phc_test" }),
    })
    await client.analytics.track({ event: "pro_upgrade_triggered" })
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: "user-abc" }),
    )
  })

  it("rejects unknown event names", async () => {
    const client = createRouterClient(router, { context: ctx(authedSession) })
    await expect(
      client.analytics.track({ event: "unknown_event" as any }),
    ).rejects.toThrow()
  })
})
