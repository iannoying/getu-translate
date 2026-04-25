import { createStore } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Capture the live mock fn so each test can swap behaviour without re-importing.
const sendMessageMock = vi.fn<(...args: unknown[]) => unknown>()
const onMessageMock = vi.fn<(...args: unknown[]) => unknown>(() => () => {})

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
  onMessage: onMessageMock,
}))

describe("createTranslationStateAtomForContentScript", () => {
  beforeEach(() => {
    sendMessageMock.mockReset()
    onMessageMock.mockReset().mockImplementation(() => () => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("does not surface unhandled rejection when initial sendMessage rejects with messaging-disconnect", async () => {
    sendMessageMock.mockRejectedValue(
      new Error("Could not establish connection. Receiving end does not exist."),
    )
    const loggerModule = await import("@/utils/logger")
    const errorSpy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const { createTranslationStateAtomForContentScript } = await import("../translation-state")
    const atom = createTranslationStateAtomForContentScript({ enabled: false })

    const store = createStore()
    // Subscribing forces onMount to run.
    const unsub = store.sub(atom, () => {})

    // Wait one microtask tick so the rejected promise's `.catch` runs.
    await Promise.resolve()
    await Promise.resolve()

    // Lifecycle errors must NOT reach the logger — they're expected during
    // extension reload and the existing helper is responsible for swallowing.
    expect(errorSpy).not.toHaveBeenCalled()

    unsub()
    errorSpy.mockRestore()
  })

  it("does not surface unhandled rejection when initial sendMessage rejects with extension-context-invalidated", async () => {
    sendMessageMock.mockRejectedValue(new Error("Extension context invalidated."))
    const loggerModule = await import("@/utils/logger")
    const errorSpy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const { createTranslationStateAtomForContentScript } = await import("../translation-state")
    const atom = createTranslationStateAtomForContentScript({ enabled: false })

    const store = createStore()
    const unsub = store.sub(atom, () => {})
    await Promise.resolve()
    await Promise.resolve()

    expect(errorSpy).not.toHaveBeenCalled()

    unsub()
    errorSpy.mockRestore()
  })

  it("logs unrelated errors via logger.error (regression: real bugs must surface)", async () => {
    const realError = new Error("schema mismatch")
    sendMessageMock.mockRejectedValue(realError)
    const loggerModule = await import("@/utils/logger")
    const errorSpy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const { createTranslationStateAtomForContentScript } = await import("../translation-state")
    const atom = createTranslationStateAtomForContentScript({ enabled: false })

    const store = createStore()
    const unsub = store.sub(atom, () => {})
    await Promise.resolve()
    await Promise.resolve()

    expect(errorSpy).toHaveBeenCalledWith(
      "translationStateAtom initial sendMessage failed:",
      realError,
    )

    unsub()
    errorSpy.mockRestore()
  })
})
