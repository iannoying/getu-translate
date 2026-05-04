import { beforeEach, describe, expect, it, vi } from "vitest"
import { logger } from "../logger"

vi.mock("../posthog", () => ({
  captureEvent: vi.fn().mockResolvedValue(undefined),
}))

import { captureEvent } from "../posthog"

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

describe("logger forwarding gate", () => {
  it("does not forward info to PostHog by default even when env+ctx are present", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.info("info msg", { userId: "u-info" }, { env, executionCtx: mockExecutionCtx })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("does not forward warn to PostHog by default even when env+ctx are present", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.warn("warn msg", { userId: "u-warn" }, { env, executionCtx: mockExecutionCtx })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("forwards warn when explicitly opted in", async () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.warn(
      "warn msg",
      { userId: "u-warn" },
      { env, executionCtx: mockExecutionCtx, forward: true },
    )

    expect(mockWaitUntil).toHaveBeenCalledOnce()
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "phc_test",
        distinctId: "u-warn",
        event: "internal_log",
        properties: expect.objectContaining({ level: "warn", message: "warn msg" }),
      }),
    )
  })

  it("does not forward error when explicitly disabled", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("err", { userId: "u-error" }, {
      env,
      executionCtx: mockExecutionCtx,
      forward: false,
    })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })
})

describe("logger sampling", () => {
  it("does not forward when sampleRate is 0", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("sampled out", {}, { env, executionCtx: mockExecutionCtx, sampleRate: 0 })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("forwards when sampleRate is 1", async () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("sampled in", { userId: "u-sample" }, {
      env,
      executionCtx: mockExecutionCtx,
      sampleRate: 1,
    })

    expect(mockWaitUntil).toHaveBeenCalledOnce()
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "u-sample",
        properties: expect.objectContaining({ message: "sampled in" }),
      }),
    )
  })

  it("treats out-of-range sampleRate values as disabled forwarding", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("bad sample", {}, { env, executionCtx: mockExecutionCtx, sampleRate: -1 })
    logger.error("bad sample", {}, { env, executionCtx: mockExecutionCtx, sampleRate: 2 })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("uses Math.random for partial sampleRate values", async () => {
    const randomSpy = vi.spyOn(Math, "random")
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any

    randomSpy.mockReturnValueOnce(0.24)
    logger.error("sampled in partial", { userId: "u-partial" }, {
      env,
      executionCtx: mockExecutionCtx,
      sampleRate: 0.25,
    })

    randomSpy.mockReturnValueOnce(0.25)
    logger.error("sampled out partial", {}, {
      env,
      executionCtx: mockExecutionCtx,
      sampleRate: 0.25,
    })

    expect(randomSpy).toHaveBeenCalledTimes(2)
    expect(mockWaitUntil).toHaveBeenCalledOnce()
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "u-partial",
        properties: expect.objectContaining({ message: "sampled in partial" }),
      }),
    )

    randomSpy.mockRestore()
  })
})
