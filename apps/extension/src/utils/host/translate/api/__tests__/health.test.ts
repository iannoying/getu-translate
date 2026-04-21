import { describe, expect, it } from "vitest"
import { createHealthTracker } from "../health"

describe("createHealthTracker", () => {
  it("marks a provider unhealthy after threshold consecutive failures within the window", () => {
    const t = 0
    const tracker = createHealthTracker({ now: () => t, windowMs: 60_000, threshold: 3, cooldownMs: 30_000 })

    expect(tracker.isHealthy("google")).toBe(true)

    tracker.recordFailure("google")
    tracker.recordFailure("google")
    expect(tracker.isHealthy("google")).toBe(true) // still below threshold

    tracker.recordFailure("google") // hits threshold
    expect(tracker.isHealthy("google")).toBe(false)
  })

  it("provider recovers after cooldown elapses", () => {
    let t = 0
    const tracker = createHealthTracker({ now: () => t, windowMs: 60_000, threshold: 3, cooldownMs: 30_000 })

    tracker.recordFailure("microsoft")
    tracker.recordFailure("microsoft")
    tracker.recordFailure("microsoft")
    expect(tracker.isHealthy("microsoft")).toBe(false)

    t = 29_999
    expect(tracker.isHealthy("microsoft")).toBe(false)

    t = 30_000 // cooldown elapsed
    expect(tracker.isHealthy("microsoft")).toBe(true)
  })

  it("recordSuccess resets both failure history and cooldown immediately", () => {
    const t = 0
    const tracker = createHealthTracker({ now: () => t, windowMs: 60_000, threshold: 3, cooldownMs: 30_000 })

    tracker.recordFailure("bing")
    tracker.recordFailure("bing")
    tracker.recordFailure("bing")
    expect(tracker.isHealthy("bing")).toBe(false)

    tracker.recordSuccess("bing")
    expect(tracker.isHealthy("bing")).toBe(true)

    // Further failures should reset the counter from zero
    tracker.recordFailure("bing")
    tracker.recordFailure("bing")
    expect(tracker.isHealthy("bing")).toBe(true)
  })

  it("single post-cooldown failure does not re-trip the breaker", () => {
    let t = 0
    const tracker = createHealthTracker({ now: () => t, windowMs: 60_000, threshold: 3, cooldownMs: 30_000 })

    // Trip the breaker
    tracker.recordFailure("libre")
    tracker.recordFailure("libre")
    tracker.recordFailure("libre")
    expect(tracker.isHealthy("libre")).toBe(false)

    // Advance past cooldown — provider recovers and failures map is cleared
    t = 30_000
    expect(tracker.isHealthy("libre")).toBe(true)

    // One new failure after recovery should not re-trip (needs threshold=3 fresh failures)
    tracker.recordFailure("libre")
    expect(tracker.isHealthy("libre")).toBe(true)

    // A second failure is still below threshold
    tracker.recordFailure("libre")
    expect(tracker.isHealthy("libre")).toBe(true)

    // Third fresh failure re-trips
    tracker.recordFailure("libre")
    expect(tracker.isHealthy("libre")).toBe(false)
  })

  it("old failures outside the sliding window do not count toward the threshold", () => {
    let t = 0
    const tracker = createHealthTracker({ now: () => t, windowMs: 60_000, threshold: 3, cooldownMs: 30_000 })

    // Two failures at t=0
    tracker.recordFailure("yandex")
    tracker.recordFailure("yandex")

    // Advance past the window
    t = 60_001

    // One fresh failure — only 1 in the window, below threshold
    tracker.recordFailure("yandex")
    expect(tracker.isHealthy("yandex")).toBe(true)

    // Two more bring it to threshold within the window
    tracker.recordFailure("yandex")
    tracker.recordFailure("yandex")
    expect(tracker.isHealthy("yandex")).toBe(false)
  })
})
