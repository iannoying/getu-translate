// apps/api/src/middleware/__tests__/rate-limit-core.test.ts
import { describe, expect, it, vi } from "vitest"
import type { KVNamespace } from "@cloudflare/workers-types"
import { checkAndIncrementRateLimit, type RateLimitConfig } from "../rate-limit-core"

function makeKv() {
  const store = new Map<string, { value: string; expiresAt: number }>()
  const now = () => Date.now()
  return {
    store,
    kv: {
      async get(k: string) {
        const e = store.get(k)
        if (!e) return null
        if (e.expiresAt <= now()) {
          store.delete(k)
          return null
        }
        return e.value
      },
      async put(k: string, v: string, opts?: { expirationTtl?: number }) {
        const ttlMs = (opts?.expirationTtl ?? 0) * 1000
        store.set(k, { value: v, expiresAt: now() + ttlMs })
      },
      async delete(k: string) {
        store.delete(k)
      },
    } as unknown as KVNamespace,
  }
}

const cfg: RateLimitConfig = { limit: 60, windowMs: 60_000 }

describe("checkAndIncrementRateLimit", () => {
  it("allows the first request and writes count=1 with 120s TTL", async () => {
    const { kv, store } = makeKv()
    const r = await checkAndIncrementRateLimit(kv, "u-alice", cfg)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(59)
    expect(r.retryAfterSeconds).toBe(0)
    // One key written; key shape: "rl:<key>:<minuteEpoch>"
    expect(store.size).toBe(1)
    const entry = [...store.values()][0]
    expect(entry.value).toBe("1")
    // TTL must be >= 60s (full window + ~60s buffer)
    expect(entry.expiresAt - Date.now()).toBeGreaterThanOrEqual(60_000)
    expect(entry.expiresAt - Date.now()).toBeLessThanOrEqual(125_000)
  })

  it("increments existing count and stays allowed below the limit", async () => {
    const { kv } = makeKv()
    for (let i = 0; i < 10; i++) {
      const r = await checkAndIncrementRateLimit(kv, "u-bob", cfg)
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(60 - (i + 1))
    }
  })

  it("rejects exactly at the limit (61st request)", async () => {
    const { kv } = makeKv()
    for (let i = 0; i < 60; i++) {
      const r = await checkAndIncrementRateLimit(kv, "u-eve", cfg)
      expect(r.allowed).toBe(true)
    }
    const r = await checkAndIncrementRateLimit(kv, "u-eve", cfg)
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.retryAfterSeconds).toBeGreaterThan(0)
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it("uses separate buckets per key (alice and bob don't share quota)", async () => {
    const { kv } = makeKv()
    for (let i = 0; i < 60; i++) {
      await checkAndIncrementRateLimit(kv, "u-alice", cfg)
    }
    const aliceBlocked = await checkAndIncrementRateLimit(kv, "u-alice", cfg)
    const bobOk = await checkAndIncrementRateLimit(kv, "u-bob", cfg)
    expect(aliceBlocked.allowed).toBe(false)
    expect(bobOk.allowed).toBe(true)
  })

  it("uses a different KV bucket once the minute rolls over", async () => {
    const { kv, store } = makeKv()
    const t0 = new Date("2026-04-28T12:00:30Z").getTime()
    const t1 = new Date("2026-04-28T12:01:30Z").getTime() // next minute
    const spy = vi.spyOn(Date, "now").mockReturnValue(t0)
    try {
      for (let i = 0; i < 60; i++) {
        await checkAndIncrementRateLimit(kv, "u-clock", cfg)
      }
      // At t0, alice exhausted the limit
      expect((await checkAndIncrementRateLimit(kv, "u-clock", cfg)).allowed).toBe(false)
      // Roll to next minute
      spy.mockReturnValue(t1)
      const r = await checkAndIncrementRateLimit(kv, "u-clock", cfg)
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(59)
      // Two distinct KV keys (one per minute bucket) exist
      const keysWithUClock = [...store.keys()].filter((k) => k.includes("u-clock"))
      expect(keysWithUClock.length).toBe(2)
    } finally {
      spy.mockRestore()
    }
  })

  it("retryAfterSeconds equals seconds remaining in the current minute when blocked", async () => {
    const { kv } = makeKv()
    const t0 = new Date("2026-04-28T12:00:00Z").getTime() // start of minute
    const tBlocked = new Date("2026-04-28T12:00:42Z").getTime() // 42s into minute
    const spy = vi.spyOn(Date, "now").mockReturnValue(t0)
    try {
      for (let i = 0; i < 60; i++) {
        await checkAndIncrementRateLimit(kv, "u-time", cfg)
      }
      spy.mockReturnValue(tBlocked)
      const r = await checkAndIncrementRateLimit(kv, "u-time", cfg)
      expect(r.allowed).toBe(false)
      expect(r.retryAfterSeconds).toBe(60 - 42)
    } finally {
      spy.mockRestore()
    }
  })

  it("non-numeric KV value (corrupt) is treated as zero, not crash", async () => {
    const { kv, store } = makeKv()
    const minuteEpoch = Math.floor(Date.now() / 60_000)
    store.set(`rl:u-corrupt:${minuteEpoch}`, {
      value: "not-a-number",
      expiresAt: Date.now() + 120_000,
    })
    const r = await checkAndIncrementRateLimit(kv, "u-corrupt", cfg)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(59)
  })

  it("rejects all requests when limit=0", async () => {
    const { kv } = makeKv()
    const r = await checkAndIncrementRateLimit(kv, "u-blocked", { limit: 0, windowMs: 60_000 })
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })
})
