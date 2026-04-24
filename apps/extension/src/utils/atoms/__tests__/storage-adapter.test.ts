import { describe, expect, it, vi } from "vitest"
import {
  isExtensionContextInvalidatedError,
  swallowInvalidatedStorageRead,
} from "../storage-adapter"

describe("isExtensionContextInvalidatedError", () => {
  it("returns true for the canonical Chrome/Firefox error message", () => {
    expect(isExtensionContextInvalidatedError(new Error("Extension context invalidated."))).toBe(true)
  })

  it("returns true when the message embeds the phrase with extra context", () => {
    expect(isExtensionContextInvalidatedError(new Error("chrome.storage: Extension context invalidated while reading"))).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(isExtensionContextInvalidatedError(new Error("Something else"))).toBe(false)
  })

  it("returns false for non-Error values", () => {
    expect(isExtensionContextInvalidatedError("Extension context invalidated.")).toBe(false)
    expect(isExtensionContextInvalidatedError(null)).toBe(false)
    expect(isExtensionContextInvalidatedError(undefined)).toBe(false)
  })
})

describe("swallowInvalidatedStorageRead", () => {
  it("silently swallows invalidated-context errors without calling logger", async () => {
    const loggerModule = await import("../../logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowInvalidatedStorageRead("testAtom")
    expect(() => handler(new Error("Extension context invalidated."))).not.toThrow()
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it("logs non-invalidation errors through the shared logger", async () => {
    const loggerModule = await import("../../logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowInvalidatedStorageRead("testAtom")
    const realFailure = new Error("disk full")
    handler(realFailure)

    expect(spy).toHaveBeenCalledWith("testAtom storage read failed:", realFailure)
    spy.mockRestore()
  })
})
