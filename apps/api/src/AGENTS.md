<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-04 -->

# src

## Purpose

Source root of the `@getu/api` Cloudflare Worker. Wires the Hono app (`index.ts`), exports the Worker handler (`worker.ts`), and groups domain code into `ai/`, `billing/`, `orpc/`, and `scheduled/`.

## Key Files

| File        | Description                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`  | Hono app: CORS, `/health`, `/api/identity/*` (better-auth), `/orpc/*`, `/ai/v1/*`, webhook routes. Default-exports `app`.                          |
| `worker.ts` | Worker `ExportedHandler`: `fetch` → `app.fetch`, `scheduled` → runs retention + translation-cleanup + translation-retry + translation-stuck-sweep. |
| `auth.ts`   | `createAuth(env)` — better-auth instance configured with email/password, email OTP, passkey, Google/GitHub OAuth.                                  |
| `email.ts`  | Email sender (Resend) for OTP + transactional mail. Test double lives under `__tests__/`.                                                          |
| `env.ts`    | `WorkerEnv` type — D1, KV, secrets, env vars. Add new bindings here AND in `wrangler.toml`.                                                        |

## Subdirectories

| Directory     | Purpose                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `__tests__/`  | Cross-module tests (`email.test.ts`, `providers.test.ts`) + shared `utils/test-db.ts` harness.                                       |
| `ai/`         | AI proxy: JWT minting, rate limit, OpenAI-compatible chat-completions proxy, usage parsing (see `ai/AGENTS.md`).                     |
| `analytics/`  | PostHog integration: typed event helpers, structured logger, low-level capture primitive (see `analytics/AGENTS.md`).                |
| `billing/`    | Entitlement/quota engine + Paddle/Stripe clients, webhooks, checkout (see `billing/AGENTS.md`).                                      |
| `middleware/` | Hono middleware: KV-backed fixed-window rate limiter applied to `/orpc/*` and `/ai/v1/*` (see `middleware/AGENTS.md`).               |
| `orpc/`       | oRPC router + context + per-domain routers: `billing`, `translate`, `analytics` (see `orpc/AGENTS.md`).                              |
| `scheduled/`  | Cron-triggered jobs: retention + translation lifecycle (cleanup, retry, stuck-sweep) (see `scheduled/AGENTS.md`).                    |
| `translate/`  | Provider dispatch + LLM integration: `dispatchTranslate`, bianxie.ai adapter, document pipeline helpers (see `translate/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- **Add routes in `index.ts`**, then delegate to a handler in the appropriate subdir. Keep `index.ts` as a thin router.
- **Every route that reads user identity** goes through `createAuth(c.env).api.getSession(...)` — never trust a client-provided userId.
- **CORS** is scoped to `/api/identity/*`, `/orpc/*`, and `/ai/*` and driven by `env.ALLOWED_EXTENSION_ORIGINS`. Keep credentialed CORS — the extension relies on session cookies.
- When you add a scheduled job, register it in `worker.ts` alongside retention, and add a vitest under `scheduled/__tests__/`.

### Testing Requirements

- Tests under `__tests__/` and each subdir. Use `utils/test-db.ts` to create an in-memory DB with all migrations applied.
- Webhook tests construct signed payloads with the real signature helpers — never skip signature verification.

## Dependencies

### Internal

- `@getu/contract` — oRPC routes (consumed in `orpc/`).
- `@getu/db` — Drizzle schema + `createDb()`.

### External

- `hono`, `better-auth`, `@orpc/server`, `drizzle-orm`, `zod`.

<!-- MANUAL: -->
