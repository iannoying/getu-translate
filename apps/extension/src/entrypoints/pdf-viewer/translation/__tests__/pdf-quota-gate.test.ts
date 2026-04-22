import { describe, expect, it, vi } from "vitest"
import { createPdfQuotaGate } from "../pdf-quota-gate"

const FREE_LIMIT = 50

function makeDeps(overrides: {
  isPro?: boolean
  used?: number
  incrementReturns?: number
} = {}) {
  const isPro = vi.fn(() => overrides.isPro ?? false)
  let used = overrides.used ?? 0
  const getUsage = vi.fn(async () => used)
  const increment = vi.fn(async () => {
    used += 1
    return overrides.incrementReturns ?? used
  })
  return { isPro, getUsage, increment, limit: FREE_LIMIT }
}

describe("pdfQuotaGate", () => {
  describe("canTranslatePage", () => {
    it("returns true for free user with 0 used", async () => {
      const deps = makeDeps({ isPro: false, used: 0 })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.canTranslatePage()).resolves.toBe(true)
      expect(deps.isPro).toHaveBeenCalled()
      expect(deps.getUsage).toHaveBeenCalledOnce()
    })

    it("returns true for free user at the edge (used=49)", async () => {
      const deps = makeDeps({ isPro: false, used: 49 })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.canTranslatePage()).resolves.toBe(true)
    })

    it("returns false for free user at the cap (used=50)", async () => {
      const deps = makeDeps({ isPro: false, used: 50 })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.canTranslatePage()).resolves.toBe(false)
    })

    it("returns false for free user over the cap (used=51)", async () => {
      const deps = makeDeps({ isPro: false, used: 51 })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.canTranslatePage()).resolves.toBe(false)
    })

    it("returns true for Pro regardless of counter", async () => {
      const deps = makeDeps({ isPro: true, used: 9_999_999 })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.canTranslatePage()).resolves.toBe(true)
      // Pro short-circuits before touching the counter — keeps the quota hot
      // path off Dexie.
      expect(deps.getUsage).not.toHaveBeenCalled()
    })
  })

  describe("isExhausted", () => {
    it("returns false for free user below the cap", async () => {
      const deps = makeDeps({ isPro: false, used: 10 })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.isExhausted()).resolves.toBe(false)
    })

    it("returns true for free user at the cap", async () => {
      const deps = makeDeps({ isPro: false, used: FREE_LIMIT })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.isExhausted()).resolves.toBe(true)
    })

    it("returns false for Pro regardless of counter", async () => {
      const deps = makeDeps({ isPro: true, used: 9_999 })
      const gate = createPdfQuotaGate(deps)

      await expect(gate.isExhausted()).resolves.toBe(false)
      expect(deps.getUsage).not.toHaveBeenCalled()
    })
  })

  describe("recordPageSuccess", () => {
    it("increments the counter and returns the new count", async () => {
      const deps = makeDeps({ isPro: false, used: 10 })
      const gate = createPdfQuotaGate(deps)

      const next = await gate.recordPageSuccess()
      expect(next).toBe(11)
      expect(deps.increment).toHaveBeenCalledOnce()
    })

    it("increments for Pro users too (usage telemetry parity)", async () => {
      const deps = makeDeps({ isPro: true, used: 5 })
      const gate = createPdfQuotaGate(deps)

      const next = await gate.recordPageSuccess()
      expect(next).toBe(6)
      expect(deps.increment).toHaveBeenCalledOnce()
    })

    it("propagates increment errors", async () => {
      const deps = makeDeps({ isPro: false })
      deps.increment.mockRejectedValueOnce(new Error("dexie offline"))
      const gate = createPdfQuotaGate(deps)

      await expect(gate.recordPageSuccess()).rejects.toThrow("dexie offline")
    })
  })

  it("canTranslatePage → recordPageSuccess transitions across the cap", async () => {
    // End-to-end: simulate a free user who starts at 49 used, successfully
    // translates the 50th page (counter becomes 50), and then the gate
    // reports exhausted + denies the 51st.
    const deps = makeDeps({ isPro: false, used: 49 })
    const gate = createPdfQuotaGate(deps)

    expect(await gate.canTranslatePage()).toBe(true)
    const postSuccess = await gate.recordPageSuccess()
    expect(postSuccess).toBe(50)
    expect(await gate.isExhausted()).toBe(true)
    expect(await gate.canTranslatePage()).toBe(false)
  })
})
