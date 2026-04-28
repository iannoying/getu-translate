import { describe, expect, it } from "vitest"
import app from "../index"
import type { WorkerEnv } from "../env"

function makeKv() {
  const store = new Map<string, { value: string; expiresAt: number }>()
  return {
    async get(k: string) {
      const e = store.get(k)
      if (!e) return null
      if (e.expiresAt <= Date.now()) { store.delete(k); return null }
      return e.value
    },
    async put(k: string, v: string, opts?: { expirationTtl?: number }) {
      store.set(k, { value: v, expiresAt: Date.now() + (opts?.expirationTtl ?? 0) * 1000 })
    },
    async delete(k: string) { store.delete(k) },
  } as unknown as KVNamespace
}

function makeEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: {} as WorkerEnv["DB"],
    AUTH_SECRET: "x".repeat(48),
    AUTH_BASE_URL: "https://api.example.com",
    ALLOWED_EXTENSION_ORIGINS: "https://example.com",
    BIANXIE_API_KEY: "test-bianxie-key",
    BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
    AI_JWT_SECRET: "x".repeat(48),
    BILLING_ENABLED: "false",
    PADDLE_API_KEY: "",
    PADDLE_WEBHOOK_SECRET: "",
    PADDLE_PRICE_PRO_MONTHLY: "",
    PADDLE_PRICE_PRO_YEARLY: "",
    PADDLE_BASE_URL: "https://sandbox-api.paddle.com",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PRICE_PRO_MONTHLY: "",
    STRIPE_PRICE_PRO_YEARLY: "",
    STRIPE_PRICE_CNY_MONTHLY: "",
    STRIPE_PRICE_CNY_YEARLY: "",
    STRIPE_BASE_URL: "https://api.stripe.com",
    RATE_LIMIT_KV: makeKv(),
    ...overrides,
  }
}

describe("rate-limit integration on /orpc/*", () => {
  it("31 anonymous /orpc requests in a row → 31st is 429", async () => {
    const env = makeEnv()
    const make = () =>
      app.fetch(
        new Request("https://api.example.com/orpc/billing.getEntitlements", {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.99" },
          body: '{"json":{}}',
        }),
        env,
      )
    // 30 anonymous calls allowed
    for (let i = 0; i < 30; i++) {
      const r = await make()
      expect(r.status).not.toBe(429)
    }
    // 31st blocked
    const blocked = await make()
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/)
  })

  it("/health endpoint is NOT rate-limited (no middleware on /health)", async () => {
    const env = makeEnv()
    const make = () => app.fetch(new Request("https://api.example.com/health"), env)
    for (let i = 0; i < 50; i++) {
      const r = await make()
      expect(r.status).toBe(200)
    }
  })

  it("smoke secret bypasses /orpc rate limit when configured", async () => {
    const env = makeEnv({ RATE_LIMIT_SMOKE_SECRET: "ci-smoke-key" })
    const make = () =>
      app.fetch(
        new Request("https://api.example.com/orpc/billing.getEntitlements", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.42",
            "x-internal-smoke": "ci-smoke-key",
          },
          body: '{"json":{}}',
        }),
        env,
      )
    for (let i = 0; i < 50; i++) {
      const r = await make()
      expect(r.status).not.toBe(429)
    }
  })
})
