import { describe, expect, it } from "vitest"
import { decideInitialPolicy } from "../enqueue-policy"

describe("decideInitialPolicy", () => {
  it("returns 'enabled' for activationMode=always so translation starts on sight", () => {
    expect(decideInitialPolicy("always")).toBe("enabled")
  })

  it("returns 'blocked' for activationMode=ask so the toast gates translation", () => {
    // The toast's Accept handler is what later flips the policy to 'enabled'.
    expect(decideInitialPolicy("ask")).toBe("blocked")
  })

  it("returns 'blocked' for activationMode=manual so nothing auto-enqueues", () => {
    // In manual mode the popup/button path drives activation; the scheduler
    // never gets fed from the textlayerrendered hook.
    expect(decideInitialPolicy("manual")).toBe("blocked")
  })
})
