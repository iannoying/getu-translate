import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  __resetLifecycleGuardForTests,
  installContentScriptLifecycleGuard,
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

  it("returns true for the WXT 0.20+ storage-permission guard (browser.storage null post-reload)", () => {
    // The manifest *does* declare 'storage'; this message is misleading.
    // Chromium nulls chrome.storage post-reload while keeping chrome.runtime
    // in a stale state, so WXT's `browser.storage == null` branch fires.
    expect(isExtensionContextInvalidatedError(new Error(
      "You must add the 'storage' permission to your manifest to use 'wxt/storage'",
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
    expect(isExtensionLifecycleError(new Error("You must add the 'storage' permission to your manifest to use 'wxt/storage'"))).toBe(true)
    expect(isExtensionLifecycleError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true)
    expect(isExtensionLifecycleError(new Error("The message port closed before a response was received."))).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(isExtensionLifecycleError(new Error("disk full"))).toBe(false)
  })
})

describe("installContentScriptLifecycleGuard", () => {
  const handlers: Array<(e: PromiseRejectionEvent) => void> = []
  const mockWindow = {
    addEventListener: vi.fn((event: string, listener: (e: PromiseRejectionEvent) => void) => {
      if (event === "unhandledrejection")
        handlers.push(listener)
    }),
  }

  beforeEach(() => {
    handlers.length = 0
    mockWindow.addEventListener.mockClear()
    vi.stubGlobal("window", mockWindow)
    __resetLifecycleGuardForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __resetLifecycleGuardForTests()
  })

  it("registers an unhandledrejection listener that swallows lifecycle errors and prevents default", async () => {
    installContentScriptLifecycleGuard("test.content")

    expect(handlers).toHaveLength(1)
    const listener = handlers[0] as (e: PromiseRejectionEvent) => void

    const preventDefault = vi.fn()
    const fakeEvent = {
      reason: new Error("Extension context invalidated."),
      preventDefault,
    } as unknown as PromiseRejectionEvent
    listener(fakeEvent)

    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it("ignores non-lifecycle rejections (real bugs still surface)", async () => {
    installContentScriptLifecycleGuard("test.content")

    const listener = handlers[0] as (e: PromiseRejectionEvent) => void
    const preventDefault = vi.fn()
    listener({
      reason: new Error("schema mismatch"),
      preventDefault,
    } as unknown as PromiseRejectionEvent)

    expect(preventDefault).not.toHaveBeenCalled()
  })

  it("matches the WXT storage-permission flavour (regression for issue reported on en.wikipedia)", async () => {
    installContentScriptLifecycleGuard("test.content")

    const listener = handlers[0] as (e: PromiseRejectionEvent) => void
    const preventDefault = vi.fn()
    listener({
      reason: new Error("You must add the 'storage' permission to your manifest to use 'wxt/storage'"),
      preventDefault,
    } as unknown as PromiseRejectionEvent)

    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it("is idempotent (only registers a single listener regardless of call count)", async () => {
    installContentScriptLifecycleGuard("first")
    installContentScriptLifecycleGuard("second")
    installContentScriptLifecycleGuard("third")

    expect(handlers).toHaveLength(1)
  })

  // Reference unused import so TS doesn't strip it.
  it("keeps the named export available", () => {
    expect(typeof installContentScriptLifecycleGuard).toBe("function")
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
