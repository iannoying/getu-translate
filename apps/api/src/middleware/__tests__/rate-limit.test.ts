import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { rateLimit, type RateLimitMiddlewareOptions } from "../rate-limit"

function makeKv() {
  const store = new Map<string, { value: string; expiresAt: number }>()
  return {
    store,
    kv: {
      async get(k: string) { return store.get(k)?.value ?? null },
      async put(k: string, v: string, opts?: { expirationTtl?: number }) {
        store.set(k, { value: v, expiresAt: Date.now() + (opts?.expirationTtl ?? 0) * 1000 })
      },
      async delete(k: string) { store.delete(k) },
    } as unknown as KVNamespace,
  }
}

type TestEnv = {
  RATE_LIMIT_KV: KVNamespace
  RATE_LIMIT_SMOKE_SECRET?: string
}

function makeApp(opts: RateLimitMiddlewareOptions, env: TestEnv) {
  const app = new Hono<{ Bindings: TestEnv; Variables: { session: { user: { id: string } } | null } }>()
  // Inject session via header for tests
  app.use("*", async (c, next) => {
    const userId = c.req.header("x-test-user")
    c.set("session", userId ? { user: { id: userId } } : null)
    await next()
  })
  app.use("*", rateLimit(opts))
  app.get("/test", (c) => c.text("ok"))
  return (req: Request) => app.fetch(req, env)
}

describe("rateLimit middleware", () => {
  it("authenticated user under limit → passes through", async () => {
    const { kv } = makeKv()
    const fetch = makeApp({ limitAuth: 60, limitAnon: 30 }, { RATE_LIMIT_KV: kv })
    const r = await fetch(new Request("https://x/test", { headers: { "x-test-user": "u1" } }))
    expect(r.status).toBe(200)
  })

  it("authenticated user at limit → 429 + Retry-After header", async () => {
    const { kv } = makeKv()
    const fetch = makeApp({ limitAuth: 2, limitAnon: 30 }, { RATE_LIMIT_KV: kv })
    const make = () => fetch(new Request("https://x/test", { headers: { "x-test-user": "u1" } }))
    expect((await make()).status).toBe(200)
    expect((await make()).status).toBe(200)
    const blocked = await make()
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/)
    const body = await blocked.json() as { error: string; code: string }
    expect(body.code).toBe("RATE_LIMITED")
  })

  it("anonymous request keyed by CF-Connecting-IP header", async () => {
    const { kv, store } = makeKv()
    const fetch = makeApp({ limitAuth: 60, limitAnon: 2 }, { RATE_LIMIT_KV: kv })
    const ip = "203.0.113.5"
    const make = () => fetch(new Request("https://x/test", { headers: { "cf-connecting-ip": ip } }))
    expect((await make()).status).toBe(200)
    expect((await make()).status).toBe(200)
    expect((await make()).status).toBe(429)
    // KV key must contain "ip:203.0.113.5", not just empty
    const kvKey = [...store.keys()][0]
    expect(kvKey).toContain(`ip:${ip}`)
  })

  it("falls back to X-Forwarded-For first segment when CF-Connecting-IP absent", async () => {
    const { kv, store } = makeKv()
    const fetch = makeApp({ limitAuth: 60, limitAnon: 30 }, { RATE_LIMIT_KV: kv })
    await fetch(new Request("https://x/test", {
      headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
    }))
    const kvKey = [...store.keys()][0]
    expect(kvKey).toContain("ip:198.51.100.7")
  })

  it("anonymous with no IP header at all → still rate-limits with 'ip:unknown' key", async () => {
    const { kv, store } = makeKv()
    const fetch = makeApp({ limitAuth: 60, limitAnon: 2 }, { RATE_LIMIT_KV: kv })
    const make = () => fetch(new Request("https://x/test"))
    expect((await make()).status).toBe(200)
    expect((await make()).status).toBe(200)
    expect((await make()).status).toBe(429)
    const kvKey = [...store.keys()][0]
    expect(kvKey).toContain("ip:unknown")
  })

  it("authenticated users use limitAuth, not limitAnon", async () => {
    const { kv } = makeKv()
    const fetch = makeApp({ limitAuth: 5, limitAnon: 1 }, { RATE_LIMIT_KV: kv })
    const make = () => fetch(new Request("https://x/test", { headers: { "x-test-user": "u1" } }))
    for (let i = 0; i < 5; i++) {
      expect((await make()).status).toBe(200)
    }
    expect((await make()).status).toBe(429)
  })

  it("smoke-test secret header bypasses rate limit", async () => {
    const { kv } = makeKv()
    const fetch = makeApp(
      { limitAuth: 1, limitAnon: 1 },
      { RATE_LIMIT_KV: kv, RATE_LIMIT_SMOKE_SECRET: "shh-secret" },
    )
    // Fire 10 requests with the secret — all pass
    for (let i = 0; i < 10; i++) {
      const r = await fetch(
        new Request("https://x/test", {
          headers: { "x-test-user": "u1", "x-internal-smoke": "shh-secret" },
        }),
      )
      expect(r.status).toBe(200)
    }
  })

  it("smoke header without env secret configured → does NOT bypass (closed-by-default)", async () => {
    const { kv } = makeKv()
    const fetch = makeApp(
      { limitAuth: 2, limitAnon: 30 },
      { RATE_LIMIT_KV: kv /* no RATE_LIMIT_SMOKE_SECRET */ },
    )
    const headers = { "x-test-user": "u1", "x-internal-smoke": "any" }
    expect((await fetch(new Request("https://x/test", { headers }))).status).toBe(200)
    expect((await fetch(new Request("https://x/test", { headers }))).status).toBe(200)
    expect((await fetch(new Request("https://x/test", { headers }))).status).toBe(429)
  })

  it("smoke header with wrong secret → does NOT bypass", async () => {
    const { kv } = makeKv()
    const fetch = makeApp(
      { limitAuth: 2, limitAnon: 30 },
      { RATE_LIMIT_KV: kv, RATE_LIMIT_SMOKE_SECRET: "right-secret" },
    )
    const headers = { "x-test-user": "u1", "x-internal-smoke": "wrong-secret" }
    expect((await fetch(new Request("https://x/test", { headers }))).status).toBe(200)
    expect((await fetch(new Request("https://x/test", { headers }))).status).toBe(200)
    expect((await fetch(new Request("https://x/test", { headers }))).status).toBe(429)
  })

  it("missing RATE_LIMIT_KV binding → fail-open with console.warn (don't 500 the whole worker)", async () => {
    const fetch = makeApp({ limitAuth: 1, limitAnon: 1 }, {} as TestEnv) // no kv
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const r = await fetch(new Request("https://x/test", { headers: { "x-test-user": "u1" } }))
      expect(r.status).toBe(200) // fail-open
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/RATE_LIMIT_KV/),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
