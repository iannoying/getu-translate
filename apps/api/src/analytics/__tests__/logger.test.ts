import { beforeEach, describe, expect, it, vi } from "vitest"
import { logger } from "../logger"

vi.mock("../posthog", () => ({
  captureEvent: vi.fn().mockResolvedValue(undefined),
}))

const mockWaitUntil = vi.fn()
const mockExecutionCtx = { waitUntil: mockWaitUntil } as unknown as ExecutionContext

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "info").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe("logger.info", () => {
  it("calls console.info with level prefix", () => {
    logger.info("test message", { key: "val" })
    expect(console.info).toHaveBeenCalledWith("[info]", "test message", { key: "val" })
  })

  it("does not call PostHog when no env", () => {
    logger.info("msg")
    expect(mockWaitUntil).not.toHaveBeenCalled()
  })
})

describe("logger.warn", () => {
  it("calls console.warn with level prefix", () => {
    logger.warn("warn message", { x: 1 })
    expect(console.warn).toHaveBeenCalledWith("[warn]", "warn message", { x: 1 })
  })

  it("does not fan out to PostHog when ctx is missing", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.warn("msg", {}, { env })
    expect(mockWaitUntil).not.toHaveBeenCalled()
  })
})

describe("logger.error", () => {
  it("calls console.error with level prefix", () => {
    logger.error("error message", { code: 500 })
    expect(console.error).toHaveBeenCalledWith("[error]", "error message", { code: 500 })
  })

  it("fans out to PostHog when env+ctx present and key configured", async () => {
    const { captureEvent } = await import("../posthog")
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("err", { userId: "u1" }, { env, executionCtx: mockExecutionCtx })

    expect(mockWaitUntil).toHaveBeenCalledOnce()
    // Resolve the waitUntil promise
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "phc_test",
        distinctId: "u1",
        event: "internal_log",
        properties: expect.objectContaining({ level: "error", message: "err" }),
      }),
    )
  })

  it("uses 'system' as distinctId when userId prop is absent", async () => {
    const { captureEvent } = await import("../posthog")
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("err", { code: 500 }, { env, executionCtx: mockExecutionCtx })
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: "system" }),
    )
  })

  it("does not fan out when POSTHOG_PROJECT_KEY is absent", () => {
    const env = {} as any
    logger.error("err", {}, { env, executionCtx: mockExecutionCtx })
    expect(mockWaitUntil).not.toHaveBeenCalled()
  })
})
