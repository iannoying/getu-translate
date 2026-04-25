import { describe, expect, it, vi } from "vitest"
import {
  isExtensionContextInvalidatedError,
  isExtensionLifecycleError,
  isMessagingDisconnectError,
  swallowExtensionLifecycleError,
  swallowInvalidatedStorageRead,
} from "../extension-lifecycle"

describe("isExtensionContextInvalidatedError", () => {
  it("returns true for the canonical Chrome/Firefox error message", () => {
    expect(isExtensionContextInvalidatedError(new Error("Extension context invalidated."))).toBe(true)
  })

  it("returns true when the message embeds the phrase with extra context", () => {
    expect(isExtensionContextInvalidatedError(new Error("chrome.storage: Extension context invalidated while reading"))).toBe(true)
  })

  it("returns true for the WXT 0.20+ storage guard message after browser.runtime is null", () => {
    expect(isExtensionContextInvalidatedError(new Error(
      "'wxt/storage' must be loaded in a web extension environment\n - If thrown during a build, see https://github.com/wxt-dev/wxt/issues/371",
    ))).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(isExtensionContextInvalidatedError(new Error("Something else"))).toBe(false)
  })

  it("returns false for messaging-disconnect errors (handled by sibling matcher)", () => {
    expect(isExtensionContextInvalidatedError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(false)
  })

  it("returns false for non-Error values", () => {
    expect(isExtensionContextInvalidatedError("Extension context invalidated.")).toBe(false)
    expect(isExtensionContextInvalidatedError(null)).toBe(false)
    expect(isExtensionContextInvalidatedError(undefined)).toBe(false)
  })
})

describe("isMessagingDisconnectError", () => {
  it("returns true for 'Could not establish connection' (no receiver / extension reload)", () => {
    expect(isMessagingDisconnectError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true)
  })

  it("returns true for 'The message port closed before a response was received'", () => {
    expect(isMessagingDisconnectError(new Error("The message port closed before a response was received."))).toBe(true)
  })

  it("returns false for context-invalidation errors (handled by sibling matcher)", () => {
    expect(isMessagingDisconnectError(new Error("Extension context invalidated."))).toBe(false)
  })

  it("returns false for unrelated errors and non-Error values", () => {
    expect(isMessagingDisconnectError(new Error("network down"))).toBe(false)
    expect(isMessagingDisconnectError("Could not establish connection")).toBe(false)
    expect(isMessagingDisconnectError(null)).toBe(false)
  })
})

describe("isExtensionLifecycleError", () => {
  it("matches both invalidated-context and messaging-disconnect families", () => {
    expect(isExtensionLifecycleError(new Error("Extension context invalidated."))).toBe(true)
    expect(isExtensionLifecycleError(new Error("'wxt/storage' must be loaded in a web extension environment"))).toBe(true)
    expect(isExtensionLifecycleError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true)
    expect(isExtensionLifecycleError(new Error("The message port closed before a response was received."))).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(isExtensionLifecycleError(new Error("disk full"))).toBe(false)
  })
})

describe("swallowInvalidatedStorageRead", () => {
  it("silently swallows invalidated-context errors without calling logger", async () => {
    const loggerModule = await import("../logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowInvalidatedStorageRead("testAtom")
    expect(() => handler(new Error("Extension context invalidated."))).not.toThrow()
    expect(() => handler(new Error("'wxt/storage' must be loaded in a web extension environment"))).not.toThrow()
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it("does NOT swallow messaging-disconnect errors (they may signal real bugs in storage paths)", async () => {
    const loggerModule = await import("../logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowInvalidatedStorageRead("testAtom")
    const disconnect = new Error("Could not establish connection. Receiving end does not exist.")
    handler(disconnect)

    expect(spy).toHaveBeenCalledWith("testAtom storage read failed:", disconnect)
    spy.mockRestore()
  })

  it("logs non-invalidation errors through the shared logger", async () => {
    const loggerModule = await import("../logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowInvalidatedStorageRead("testAtom")
    const realFailure = new Error("disk full")
    handler(realFailure)

    expect(spy).toHaveBeenCalledWith("testAtom storage read failed:", realFailure)
    spy.mockRestore()
  })
})

describe("swallowExtensionLifecycleError", () => {
  it("silently swallows both invalidated-context AND messaging-disconnect errors", async () => {
    const loggerModule = await import("../logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowExtensionLifecycleError("translationStateAtom initial")
    expect(() => handler(new Error("Extension context invalidated."))).not.toThrow()
    expect(() => handler(new Error("'wxt/storage' must be loaded in a web extension environment"))).not.toThrow()
    expect(() => handler(new Error("Could not establish connection. Receiving end does not exist."))).not.toThrow()
    expect(() => handler(new Error("The message port closed before a response was received."))).not.toThrow()
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it("logs non-lifecycle errors through the shared logger", async () => {
    const loggerModule = await import("../logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowExtensionLifecycleError("translationStateAtom initial")
    const realFailure = new Error("type mismatch")
    handler(realFailure)

    expect(spy).toHaveBeenCalledWith("translationStateAtom initial failed:", realFailure)
    spy.mockRestore()
  })
})
