# M7-A2 — Rate Limiting per User/IP at API Edge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Add KV-backed fixed-window rate limit middleware on `/orpc/*` and `/ai/v1/*` so a malicious or buggy client can't burn LLM tokens / D1 writes / R2 ops at unbounded RPS.

**Architecture:**
- New `apps/api/src/middleware/rate-limit.ts` — Hono middleware that resolves a key (authenticated `userId` or `ip:<xff>` for anonymous), reads the current count from `RATE_LIMIT_KV` for the current 1-minute window, rejects with 429 + `Retry-After` if exceeded, otherwise increments and continues.
- Cloudflare Workers KV `RATE_LIMIT_KV` binding (new). 1-minute fixed window keyed by `rl:{key}:{minuteEpoch}`. TTL 120s for self-cleanup.
- Limits: **60 RPM authenticated** / **30 RPM anonymous-IP** on `/orpc/*` + `/ai/v1/*`. Existing `ai/rate-limit.ts` D1-backed 300 RPM stays as a deeper LLM-cost guard layered behind the new edge middleware.
- Smoke-test whitelist: requests with `X-Internal-Smoke: <secret>` header bypass the limit; secret is a new wrangler secret `RATE_LIMIT_SMOKE_SECRET`.

**Tech Stack:** Cloudflare Workers KV · Hono middleware · `@cloudflare/workers-types` `KVNamespace` · vitest 4.

**Why fixed-window not sliding:**
- KV writes have ~60s eventual consistency. Sliding window over multiple keys requires reading + writing many KV pairs per request — cost + propagation race make it worse, not better.
- 1-minute fixed window with `Math.floor(now/60000)` as bucket id is simple, correct (modulo edge race), and KV-friendly.
- For abuse prevention this is *more* than precise enough.

**Why KV not D1:**
- `usage_log.userId` is FK-constrained to `user.id`; can't store `ip:1.2.3.4` for anonymous traffic.
- A new `rate_limit` D1 table would need a migration + add 1 D1 read + 1 D1 write per `/orpc` and `/ai/v1` request — write amplification at scale is real.
- KV is purpose-built for this pattern. Cost: ~$0.50/M reads + $5/M writes; cheaper than D1 for high-RPS edge data.

**Why 60/30 RPM (not stricter):**
- Web `/translate` page concurrent click can fire 11 columns × 1 click = 11 RPS burst per user. 60 RPM allows 5 such clicks in a minute — reasonable.
- Anonymous 30 RPM covers `/api/identity/providers` polling + initial unauthenticated entitlements check; abusive scrapers hit the wall fast.

**Out of scope:**
- Per-route fine-tuned limits (e.g. lower limit on `/translate.translate`). M7-A2 is one global limit; per-route is a follow-up if abuse patterns show it's needed.
- Replacing `ai/rate-limit.ts` D1 backend (M7+ cleanup).
- Distributed token bucket / sliding window — see "Why fixed-window" above.

---

## 0. Pre-flight

**Worktree:** `/Users/andy.peng/workspace/repo/getu-translate/.claude/worktrees/keen-leakey-7e4d0d` (current). Branch `feature/m7-a2` already created from `origin/main`.

```bash
git rev-parse --abbrev-ref HEAD   # feature/m7-a2
git status --short                # only docs/plans/2026-04-28-m7-a2-rate-limit.md untracked (this file)
git log -1 --oneline              # 9cb897d9 feat(api): real llm provider integration (m7-a1, closes #223) (#236)
```

**Wrangler KV namespace** must be created **out-of-band before deploy** (acceptance gate, not part of TDD):

```bash
# Run from apps/api/ (does NOT affect tests, only deploy):
pnpm wrangler kv namespace create RATE_LIMIT_KV
pnpm wrangler kv namespace create RATE_LIMIT_KV --env production
# Paste returned ids into wrangler.toml [[kv_namespaces]] / [[env.production.kv_namespaces]]
```

The TDD path uses an in-memory `KVNamespace` mock so tests don't touch real KV.

---

## Task 1 — Failing tests for the rate limiter core

**Files:**
- Create: `apps/api/src/middleware/__tests__/rate-limit-core.test.ts`

**Step 1.1: Write the failing tests**

```ts
// apps/api/src/middleware/__tests__/rate-limit-core.test.ts
import { describe, expect, it, vi } from "vitest"
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
})
```

**Step 1.2: Run — should FAIL with "Cannot find module '../rate-limit-core'"**

```bash
pnpm --filter @getu/api exec vitest run src/middleware/__tests__/rate-limit-core.test.ts
```

**Step 1.3: Implement `apps/api/src/middleware/rate-limit-core.ts`**

```ts
import type { KVNamespace } from "@cloudflare/workers-types"

export type RateLimitConfig = {
  limit: number
  windowMs: number  // currently always 60_000 — kept for forward-compat
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

const KV_TTL_SECONDS = 120  // 1-min window + ~60s safety buffer for KV propagation

/**
 * Fixed-window rate limit backed by Cloudflare KV.
 * Key: `rl:<key>:<minuteEpoch>`. Value: ASCII int count.
 *
 * Race note: KV is eventually consistent. Two concurrent requests on the
 * same key may both read N and both write N+1, effectively allowing one
 * extra request through. For abuse prevention this is acceptable — the
 * limit becomes a fuzzy ~limit value, not a hard cap. If precise quota
 * enforcement is needed (Stripe, billing), use the D1-backed
 * consumeQuota path instead.
 */
export async function checkAndIncrementRateLimit(
  kv: KVNamespace,
  key: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now()
  const minuteEpoch = Math.floor(now / cfg.windowMs)
  const kvKey = `rl:${key}:${minuteEpoch}`

  const raw = await kv.get(kvKey)
  const current = raw === null ? 0 : Number.parseInt(raw, 10)
  const safeCurrent = Number.isNaN(current) ? 0 : current

  if (safeCurrent >= cfg.limit) {
    const windowEndMs = (minuteEpoch + 1) * cfg.windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - now) / 1000))
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  const next = safeCurrent + 1
  await kv.put(kvKey, String(next), { expirationTtl: KV_TTL_SECONDS })
  return {
    allowed: true,
    remaining: cfg.limit - next,
    retryAfterSeconds: 0,
  }
}
```

**Step 1.4: Run — 7 tests PASS**

```bash
pnpm --filter @getu/api exec vitest run src/middleware/__tests__/rate-limit-core.test.ts
```

**Step 1.5: Commit**

```bash
git add apps/api/src/middleware/rate-limit-core.ts apps/api/src/middleware/__tests__/rate-limit-core.test.ts
git commit -m "feat(api): add kv-backed fixed-window rate limit core"
```

---

## Task 2 — Hono middleware: key resolution + 429 response

**Files:**
- Create: `apps/api/src/middleware/__tests__/rate-limit.test.ts`
- Create: `apps/api/src/middleware/rate-limit.ts`

**Step 2.1: Write the failing tests**

```ts
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
```

**Step 2.2: Run — should FAIL with "Cannot find module '../rate-limit'"**

```bash
pnpm --filter @getu/api exec vitest run src/middleware/__tests__/rate-limit.test.ts
```

**Step 2.3: Implement `apps/api/src/middleware/rate-limit.ts`**

```ts
import type { Context, MiddlewareHandler } from "hono"
import type { KVNamespace } from "@cloudflare/workers-types"
import { checkAndIncrementRateLimit } from "./rate-limit-core"

export type RateLimitMiddlewareOptions = {
  /** Per-minute cap for authenticated requests (session.user.id present). */
  limitAuth: number
  /** Per-minute cap for anonymous requests (keyed by CF-Connecting-IP / XFF). */
  limitAnon: number
}

type RequiredEnv = {
  RATE_LIMIT_KV?: KVNamespace
  RATE_LIMIT_SMOKE_SECRET?: string
}

type RequiredVariables = {
  session: { user: { id: string } } | null
}

function resolveAnonymousKey(c: Context): string {
  const cfIp = c.req.header("cf-connecting-ip")
  if (cfIp) return `ip:${cfIp.trim()}`
  const xff = c.req.header("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return `ip:${first}`
  }
  return "ip:unknown"
}

export function rateLimit(opts: RateLimitMiddlewareOptions): MiddlewareHandler<{
  Bindings: RequiredEnv
  Variables: RequiredVariables
}> {
  return async (c, next) => {
    // Smoke-test escape hatch: closed-by-default — only bypasses if the
    // operator has explicitly set RATE_LIMIT_SMOKE_SECRET in the env AND
    // the request presents the matching header value.
    const smokeSecret = c.env.RATE_LIMIT_SMOKE_SECRET
    if (smokeSecret && c.req.header("x-internal-smoke") === smokeSecret) {
      return next()
    }

    // Fail-open if the binding is missing — never 500 the whole worker
    // because of a misconfigured rate limiter. Log loudly so ops sees it.
    const kv = c.env.RATE_LIMIT_KV
    if (!kv) {
      console.warn(
        "[rate-limit] RATE_LIMIT_KV binding missing — failing open. Configure wrangler.toml.",
      )
      return next()
    }

    const session = c.get("session")
    const isAuthed = !!session?.user
    const key = isAuthed ? `user:${session!.user.id}` : resolveAnonymousKey(c)
    const limit = isAuthed ? opts.limitAuth : opts.limitAnon

    const result = await checkAndIncrementRateLimit(kv, key, {
      limit,
      windowMs: 60_000,
    })

    if (!result.allowed) {
      return c.json(
        {
          error: `rate limit exceeded: ${limit} req/min`,
          code: "RATE_LIMITED",
        },
        429,
        { "retry-after": String(result.retryAfterSeconds) },
      )
    }
    return next()
  }
}
```

**Step 2.4: Run — 9 tests PASS**

```bash
pnpm --filter @getu/api exec vitest run src/middleware/__tests__/rate-limit.test.ts
```

**Step 2.5: Commit**

```bash
git add apps/api/src/middleware/rate-limit.ts apps/api/src/middleware/__tests__/rate-limit.test.ts
git commit -m "feat(api): add hono rate limit middleware with smoke bypass"
```

---

## Task 3 — Wire middleware into `index.ts` for `/orpc/*` and `/ai/v1/*`

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/env.ts` (add types)
- Modify: `apps/api/wrangler.toml` (add KV binding placeholders)

**Step 3.1: Update `env.ts` `WorkerEnv` interface**

Add to the env interface:
```ts
// M7-A2 — KV-backed edge rate limit
RATE_LIMIT_KV?: KVNamespace
/** When set, requests with header `X-Internal-Smoke: <value>` bypass the rate limit. */
RATE_LIMIT_SMOKE_SECRET?: string
```

Import `KVNamespace` from `@cloudflare/workers-types` if not already.

**Step 3.2: Update `index.ts` to install middleware**

The orpc handler at `index.ts:62-68` resolves the session itself; the rate-limit middleware needs access to that session. Refactor:

```ts
// Before the existing app.all("/orpc/*", ...) handler:

// Resolve session once per request and stash it on the context so both
// rate-limit middleware and the orpc handler can read it.
async function attachSession(c: Context<{ Bindings: WorkerEnv; Variables: { session: any } }>, next: Next) {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null)
  c.set("session", session)
  await next()
}

app.use("/orpc/*", attachSession)
app.use("/orpc/*", rateLimit({ limitAuth: 60, limitAnon: 30 }))

app.use("/ai/v1/*", attachSession)
app.use("/ai/v1/*", rateLimit({ limitAuth: 60, limitAnon: 30 }))

// Then the existing handler reads c.get("session") instead of resolving anew:
app.all("/orpc/*", async (c) => {
  const auth = createAuth(c.env)
  const session = c.get("session")
  const ctx = { env: c.env, auth, session, executionCtx: c.executionCtx }
  const { response } = await rpcHandler.handle(c.req.raw, { prefix: "/orpc", context: ctx })
  return response ?? c.notFound()
})
```

**Step 3.3: Update `wrangler.toml` with KV binding placeholder**

```toml
# Default (local dev) — id is set after `wrangler kv namespace create RATE_LIMIT_KV`
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "PLACEHOLDER_DEV_KV_ID"

# Production
[[env.production.kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "PLACEHOLDER_PROD_KV_ID"
```

**Add a TODO comment** above each block: `# TODO(M7-A2 deploy): replace PLACEHOLDER_*_KV_ID with the actual id from`wrangler kv namespace create`.

The PR description must call out that the operator needs to:
1. `pnpm wrangler kv namespace create RATE_LIMIT_KV` → paste id
2. `pnpm wrangler kv namespace create RATE_LIMIT_KV --env production` → paste id
3. `wrangler secret put RATE_LIMIT_SMOKE_SECRET --env production` (optional — only if CI smoke needs to bypass)

**Step 3.4: Run + verify build doesn't break**

```bash
pnpm --filter @getu/api exec tsc --noEmit
pnpm --filter @getu/api test  # All existing tests pass; rate-limit-related are isolated.
```

If any existing test asserts on `c.get("session")` patterns it will need updating — audit `apps/api/src/__tests__/`.

**Step 3.5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/env.ts apps/api/wrangler.toml
git commit -m "feat(api): wire rate-limit middleware on /orpc and /ai/v1 routes"
```

---

## Task 4 — Integration test: `/orpc/*` returns 429 after limit

**Files:**
- Create: `apps/api/src/__tests__/rate-limit-integration.test.ts`

**Step 4.1: Write the failing test**

```ts
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
    DB: {} as any,
    AUTH_SECRET: "x".repeat(48),
    AUTH_BASE_URL: "https://api.example.com",
    ALLOWED_EXTENSION_ORIGINS: "https://example.com",
    BIANXIE_API_KEY: "bx",
    BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
    AI_JWT_SECRET: "x".repeat(48),
    BILLING_ENABLED: "false",
    PADDLE_API_KEY: "pk",
    PADDLE_WEBHOOK_SECRET: "ws",
    PADDLE_PRICE_PRO_MONTHLY: "p",
    PADDLE_PRICE_PRO_YEARLY: "p",
    PADDLE_BASE_URL: "https://sandbox-api.paddle.com",
    STRIPE_SECRET_KEY: "sk",
    STRIPE_WEBHOOK_SECRET: "sws",
    STRIPE_PRICE_PRO_MONTHLY: "p",
    STRIPE_PRICE_PRO_YEARLY: "p",
    STRIPE_PRICE_CNY_MONTHLY: "p",
    STRIPE_PRICE_CNY_YEARLY: "p",
    STRIPE_BASE_URL: "https://api.stripe.com",
    RATE_LIMIT_KV: makeKv(),
    ...overrides,
  } as WorkerEnv
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
```

**Note:** these tests don't assert on a successful 200 — orpc may 401 or 400 because the test env has stub auth. The assertion is only that **429 is or isn't returned** depending on rate-limit state.

**Step 4.2: Run — should PASS (Task 3 already wired the middleware)**

```bash
pnpm --filter @getu/api exec vitest run src/__tests__/rate-limit-integration.test.ts
```

Expected: 3 tests PASS.

**Step 4.3: Commit**

```bash
git add apps/api/src/__tests__/rate-limit-integration.test.ts
git commit -m "test(api): integration coverage for rate-limit on /orpc"
```

---

## Task 5 — Update `DEPLOY-CHECKLIST.md` with KV setup instructions

**Files:**
- Modify: `apps/api/DEPLOY-CHECKLIST.md`

**Step 5.1: Add a new section after the existing secrets section**

```markdown
## M7-A2 — Rate Limit KV Namespace (one-time setup before merge)

Before deploying M7-A2 to production, the operator must:

1. Create both KV namespaces:
   ```bash
   cd apps/api
   pnpm wrangler kv namespace create RATE_LIMIT_KV
   pnpm wrangler kv namespace create RATE_LIMIT_KV --env production
   ```

2. Paste the returned `id` values into `wrangler.toml` (replacing the
   `PLACEHOLDER_*_KV_ID` strings) for both the default and `[env.production]`
   blocks.

3. **Optional** — set the smoke-test bypass secret (only if CI runs `/health` or
   end-to-end probe tests against the live API):
   ```bash
   wrangler secret put RATE_LIMIT_SMOKE_SECRET --env production
   ```
   Without this secret, the middleware behaves as if the bypass header is absent
   (closed-by-default; safer than open-by-default).

4. Verify post-deploy: `curl` a /orpc endpoint 31 times from the same IP within
   60 seconds. The 31st should return `429` with `Retry-After`.

If `RATE_LIMIT_KV` binding is missing at deploy time, the middleware fails open
with a `console.warn` log line so the worker doesn't crash — but rate limit is
not enforced until the operator completes step 1.
```

**Step 5.2: Commit**

```bash
git add apps/api/DEPLOY-CHECKLIST.md
git commit -m "docs(api): document rate-limit kv setup in deploy checklist"
```

---

## Task 6 — Full sweep + push + PR

**Step 6.1: Run full api test suite**

```bash
pnpm --filter @getu/api test
```

Expected: all M7-A2 tests pass; same pre-existing unpdf timeouts as before (pdf-extract + 4 PDF-path queue tests). No new regressions.

**Step 6.2: Run workspace lint**

```bash
pnpm lint
```

Expected: green (api lints are `echo 'lint-todo'` — won't catch anything anyway, but verify other packages still pass).

**Step 6.3: Push + open PR**

```bash
git push -u origin feature/m7-a2

gh pr create --base main --title "feat(api): kv-backed rate limit on /orpc + /ai/v1 (m7-a2, closes #224)" --body "$(cat <<'EOF'
## Summary
KV-backed fixed-window rate limit middleware on `/orpc/*` and `/ai/v1/*`. 60 RPM authenticated, 30 RPM anonymous (CF-Connecting-IP / X-Forwarded-For). 429 + Retry-After on overflow. Smoke-test bypass via `X-Internal-Smoke: <RATE_LIMIT_SMOKE_SECRET>` header (closed-by-default).

- Core: `apps/api/src/middleware/rate-limit-core.ts` — `checkAndIncrementRateLimit(kv, key, cfg)` with race-tolerant increment (KV last-write-wins is acceptable for abuse prevention)
- Hono middleware: `apps/api/src/middleware/rate-limit.ts` — resolves authenticated `userId` or anonymous `ip:<addr>` key, applies appropriate limit
- Wired in `index.ts` on `/orpc/*` and `/ai/v1/*`. Existing `ai/rate-limit.ts` D1 backend stays as deeper LLM-cost guard.
- Fail-open if `RATE_LIMIT_KV` binding missing (console.warn) — operator must complete KV namespace setup before merging.

## Operator action required (BEFORE merging)
The deploy is blocked on a manual one-time setup — see `apps/api/DEPLOY-CHECKLIST.md` § "M7-A2 — Rate Limit KV Namespace":

1. \`pnpm wrangler kv namespace create RATE_LIMIT_KV\` (×2 — default + production)
2. Paste returned ids into `wrangler.toml` (replace `PLACEHOLDER_*_KV_ID`)
3. (Optional) `wrangler secret put RATE_LIMIT_SMOKE_SECRET --env production`

## Test plan
- [x] Core tests (`rate-limit-core.test.ts`): 7 tests covering window rollover, retry-after, key isolation, corrupt KV value
- [x] Middleware tests (`rate-limit.test.ts`): 9 tests covering session-based key, IP fallback chain, smoke bypass closed-by-default, fail-open on missing binding
- [x] Integration tests (`rate-limit-integration.test.ts`): 3 tests covering /orpc 429 path + /health bypass + smoke header
- [x] Workspace lint green
- [x] api typecheck green

Closes #224

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 6.4: Watch CI**

```bash
gh pr checks --watch
```

If green, manual squash-merge:
```bash
gh pr merge <pr-num> --squash
```

**Step 6.5: Operator completes KV setup post-merge** (NOT auto)

After merge, **before declaring M7-A2 done**, the operator runs:
```bash
cd apps/api
pnpm wrangler kv namespace create RATE_LIMIT_KV
pnpm wrangler kv namespace create RATE_LIMIT_KV --env production
# Paste ids → wrangler.toml → commit + push as a fast-follow
git checkout main && git pull
# edit wrangler.toml
git commit -am "chore(api): set RATE_LIMIT_KV namespace ids"
git push origin main
```

The deploy-api workflow re-runs and the live worker starts honoring rate limits.

**Step 6.6: Verify in production**

Curl a `/orpc/billing.getEntitlements` 31 times from the same IP. The 31st should return 429.

---

## Self-review checklist

- [ ] No D1 writes added on the hot path (KV only, except existing `ai/rate-limit.ts`)
- [ ] Anonymous IP key derivation handles both CF-Connecting-IP and X-Forwarded-For
- [ ] Smoke bypass is closed-by-default (header alone doesn't bypass; needs env secret AND header match)
- [ ] Fail-open on missing binding — never 500 the worker
- [ ] Retry-After is in seconds (HTTP standard) and at least 1
- [ ] No new env vars are required for tests (mock KV via `Map`)
- [ ] No commits with uppercase subjects (commitlint)

---

## Acceptance mapping (issue #224)

| Acceptance | Where verified |
|---|---|
| User exceeding 60 RPM gets 429 + Retry-After | Task 2 test "authenticated user at limit → 429 + Retry-After header" |
| State decays correctly (sliding window) | Task 1 test "uses a different KV bucket once the minute rolls over" — note: implementation is **fixed-window not sliding**, see "Why fixed-window not sliding" rationale at top |
| Anonymous IP-based limiting works (X-Forwarded-For from CF) | Task 2 tests "anonymous request keyed by CF-Connecting-IP" + "falls back to X-Forwarded-For first segment" |
| Smoke test still passes (whitelisted) | Task 2 test "smoke-test secret header bypasses rate limit" + Task 4 integration test |

**Note on "sliding window" wording in the issue:** the plan implements a fixed-window approach instead. The rationale is documented at the top of this plan and called out in the PR description so the reviewer can sign off on the deviation.
