import type { DispatchOptions, FreeTranslateImpl } from "../dispatch"
import { describe, expect, it, vi } from "vitest"
import { dispatchFreeTranslate } from "../dispatch"

const INPUT = { text: "Hello", from: "en", to: "zh" }

function makeHealth(overrides: Partial<DispatchOptions["health"]> = {}): Required<DispatchOptions>["health"] {
  return {
    isHealthy: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    ...overrides,
  }
}

function makeImpl(result: string): FreeTranslateImpl {
  return vi.fn().mockResolvedValue({ text: result })
}

function makeFailingImpl(message: string): FreeTranslateImpl {
  return vi.fn().mockRejectedValue(new Error(message))
}

describe("dispatchFreeTranslate", () => {
  it("falls back to second provider when first fails", async () => {
    const health = makeHealth()
    const result = await dispatchFreeTranslate(INPUT, {
      order: ["google", "microsoft"],
      impls: {
        google: makeFailingImpl("google down"),
        microsoft: makeImpl("你好"),
      },
      health,
    })

    expect(result).toEqual({ text: "你好", usedProvider: "microsoft" })
  })

  it("skips unhealthy provider without calling its impl", async () => {
    const googleImpl = makeImpl("谷歌")
    const microsoftImpl = makeImpl("微软")
    const health = makeHealth({
      isHealthy: vi.fn().mockImplementation((k: string) => k !== "google"),
    })

    const result = await dispatchFreeTranslate(INPUT, {
      order: ["google", "microsoft"],
      impls: { google: googleImpl, microsoft: microsoftImpl },
      health,
    })

    expect(googleImpl).not.toHaveBeenCalled()
    expect(result.usedProvider).toBe("microsoft")
  })

  it("calls recordSuccess on success and recordFailure on error", async () => {
    const health = makeHealth()
    await dispatchFreeTranslate(INPUT, {
      order: ["google", "microsoft"],
      impls: {
        google: makeFailingImpl("network error"),
        microsoft: makeImpl("你好"),
      },
      health,
    })

    expect(health.recordFailure).toHaveBeenCalledWith("google")
    expect(health.recordSuccess).toHaveBeenCalledWith("microsoft")
    expect(health.recordSuccess).not.toHaveBeenCalledWith("google")
  })

  it("throws with last error message when all providers fail", async () => {
    const health = makeHealth()
    await expect(
      dispatchFreeTranslate(INPUT, {
        order: ["google", "microsoft"],
        impls: {
          google: makeFailingImpl("google error"),
          microsoft: makeFailingImpl("microsoft error"),
        },
        health,
      }),
    ).rejects.toThrow("All free providers failed: microsoft error")
  })

  it("throws 'no available' when order is empty", async () => {
    await expect(
      dispatchFreeTranslate(INPUT, {
        order: [],
        impls: { google: makeImpl("谷歌") },
      }),
    ).rejects.toThrow("No available free translation provider")
  })

  it("throws 'no available' when every provider is skipped as unhealthy", async () => {
    const health = makeHealth({ isHealthy: vi.fn().mockReturnValue(false) })
    const google = makeImpl("谷歌")
    const microsoft = makeImpl("微软")
    await expect(
      dispatchFreeTranslate(INPUT, {
        order: ["google", "microsoft"],
        impls: { google, microsoft },
        health,
      }),
    ).rejects.toThrow("No available free translation provider")
    expect(google).not.toHaveBeenCalled()
    expect(microsoft).not.toHaveBeenCalled()
  })

  it("skips providers missing from impls without error", async () => {
    const health = makeHealth()
    const result = await dispatchFreeTranslate(INPUT, {
      order: ["google", "microsoft"],
      impls: {
        // google intentionally absent
        microsoft: makeImpl("微软"),
      },
      health,
    })

    expect(result.usedProvider).toBe("microsoft")
    expect(result.text).toBe("微软")
  })

  it("returns result from first healthy provider", async () => {
    const health = makeHealth()
    const googleImpl = makeImpl("谷歌")
    const result = await dispatchFreeTranslate(INPUT, {
      order: ["google", "microsoft"],
      impls: { google: googleImpl, microsoft: makeImpl("微软") },
      health,
    })

    expect(result).toEqual({ text: "谷歌", usedProvider: "google" })
    expect(googleImpl).toHaveBeenCalledWith(INPUT)
  })

  it("works without health tracker provided", async () => {
    const result = await dispatchFreeTranslate(INPUT, {
      order: ["bing"],
      impls: { bing: makeImpl("必应") },
    })

    expect(result).toEqual({ text: "必应", usedProvider: "bing" })
  })
})
