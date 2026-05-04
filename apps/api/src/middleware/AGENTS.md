<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# middleware

## Purpose

Hono middleware for the `@getu/api` Cloudflare Worker. Currently contains the KV-backed fixed-window rate limiter applied to `/orpc/*` and `/ai/v1/*` routes.

## Key Files

| File                 | Description                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate-limit-core.ts` | `checkAndIncrementRateLimit(kv, key, cfg)` — pure KV implementation of a fixed-window counter. Key format: `rl:<key>:<minuteEpoch>`. Fail-fuzzy by design (eventually-consistent KV means ~limit not hard limit). Returns `{allowed, remaining, retryAfterSeconds}`. |
| `rate-limit.ts`      | `rateLimit(opts)` — Hono `MiddlewareHandler` that resolves the rate-limit key (authed = `user:<id>`, anon = `ip:<CF-Connecting-IP>`), calls `checkAndIncrementRateLimit`, and returns 429 with `retry-after` on breach. Smoke-test bypass via `x-internal-smoke` header (only active when `RATE_LIMIT_SMOKE_SECRET` is set). Fails open if `RATE_LIMIT_KV` binding is missing. |

## Subdirectories

| Directory    | Purpose                          |
| ------------ | -------------------------------- |
| `__tests__/` | Vitest unit tests for middleware |

## For AI Agents

### Working In This Directory

- `rate-limit-core.ts` is intentionally framework-agnostic — it only depends on `KVNamespace`. Keep it that way so it can be unit-tested without a Hono context.
- The KV key TTL is `ceil(windowMs / 1000) + 60s` — the extra 60s is a safety buffer for KV propagation lag. Do not remove it.
- The rate limiter is **fuzzy** (eventually consistent) — not suitable for billing/quota enforcement. Use `consumeQuota` (D1-backed, in `billing/`) for hard caps.
- When changing `limitAuth`/`limitAnon` defaults, update `wrangler.toml` environment variables and the smoke test escape hatch secret accordingly.
- The smoke-test bypass is closed-by-default: it only activates when the operator sets `RATE_LIMIT_SMOKE_SECRET` in the Worker environment.

### Testing Requirements

- `rate-limit-core.ts`: unit-test with a mock `KVNamespace` (in-memory map). Cover: first request allowed, Nth request allowed, (N+1)th denied, TTL argument, NaN-safe parse of existing KV value.
- `rate-limit.ts`: test with a Hono test client. Cover: anon IP keying, authed user keying, 429 response with `retry-after`, smoke bypass, fail-open when `RATE_LIMIT_KV` is undefined.

### Common Patterns

- Middleware factory returns a `MiddlewareHandler` — call `rateLimit({ limitAuth, limitAnon })` in `index.ts` and chain with `.use()`.
- Anonymous key resolution prefers `cf-connecting-ip` (Cloudflare header) over `x-forwarded-for` to avoid IP spoofing via XFF manipulation.

## Dependencies

### Internal

- `apps/api/src/env.ts` — `WorkerEnv` type (provides `RATE_LIMIT_KV`, `RATE_LIMIT_SMOKE_SECRET`).

### External

- `hono` — `Context`, `MiddlewareHandler`.
- `@cloudflare/workers-types` — `KVNamespace`.

<!-- MANUAL: -->
