<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-08 -->

# src

## Purpose

Source root of the `@getu/api` Cloudflare Worker. Wires the Hono app (`index.ts`), exports the Worker handler (`worker.ts`) wrapped by `withSentry`, and groups domain code into `ai/`, `analytics/`, `billing/`, `middleware/`, `orpc/`, `queue/`, `scheduled/`, and `translate/`. The Worker is a single isolate handling three event types: HTTP `fetch`, cron `scheduled`, and Cloudflare Queues `queue`.

## Key Files

| File        | Description                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`  | Hono app: per-route credentialed CORS for `/api/identity/*`, `/orpc/*`, `/api/translate/document/*`, `/ai/*`. `/health`. better-auth (`/api/identity/*`). `/api/translate/document/*` Hono routes. oRPC router under `/orpc/*` (rate-limited 60 auth / 30 anon). AI proxy under `/ai/v1/*` with JWT mint at `/ai/v1/token`. Paddle + Stripe webhook routes. Default-exports `app`. |
| `worker.ts` | `ExportedHandler` wrapped in `withSentry`. `fetch` → `app.fetch`. `scheduled` → fans out `runRetention`, `runTranslationCleanup`, `runTranslationStuckSweep`, `runTranslationRetry`, `runSpendMonitor` via `Promise.allSettled` inside `ctx.waitUntil`; failures route through `logger.error`. `queue` → delegates to `createQueueHandler({ db, bucket, env })` for the document-translation consumer; acks all messages and warns when `BUCKET_PDFS` is unbound. |
| `auth.ts`   | `createAuth(env)` — better-auth instance with email/password, email OTP, passkey, Google/GitHub OAuth.                                                                                                                                                                                                                                                                            |
| `email.ts`  | Email sender (Resend) for OTP + transactional mail.                                                                                                                                                                                                                                                                                                                               |
| `env.ts`    | `WorkerEnv` type — D1, KV (`RATE_LIMIT_KV`), R2 (`BUCKET_PDFS`), Queue (`TRANSLATE_QUEUE`), all secrets/env vars (Paddle, Stripe, bianxie, PostHog, Sentry, Slack webhook, spend thresholds, JWT signing key, OAuth client IDs). Also defines `AppVariables` for Hono context (`auth`, `session`). Add new bindings here AND in `wrangler.toml`. |

## Subdirectories

| Directory     | Purpose                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/`  | Cross-module tests (`email.test.ts`, `providers.test.ts`, `rate-limit-integration.test.ts`) + shared `utils/test-db.ts` harness (in-memory SQLite via `better-sqlite3`).      |
| `ai/`         | AI proxy: JWT minting (`/ai/v1/token`), OpenAI-compatible chat-completions proxy, usage parsing (see `ai/AGENTS.md`).                                                         |
| `analytics/`  | PostHog integration: typed event helpers, structured logger with sampled gated fan-out, low-level capture primitive, console-audit guard test (see `analytics/AGENTS.md`).    |
| `billing/`    | Entitlement/quota engine + Paddle/Stripe clients, webhooks, checkout (see `billing/AGENTS.md`).                                                                               |
| `middleware/` | Hono middleware: KV-backed fixed-window rate limiter applied to `/orpc/*` and `/ai/v1/*` with smoke-test bypass (see `middleware/AGENTS.md`).                                 |
| `orpc/`       | oRPC router + context + per-domain routers: `billing`, `translate` (text + document), `analytics` (see `orpc/AGENTS.md`).                                                    |
| `queue/`      | Cloudflare Queues consumer for document translation (`translate-document.ts`) — runs PDF extract → chunk → dispatch → bilingual output, with progress heartbeat. Invoked from `worker.ts`'s `queue` handler. |
| `scheduled/`  | Cron-triggered jobs: retention, translation lifecycle (cleanup, retry, stuck-sweep), spend monitor (see `scheduled/AGENTS.md`).                                              |
| `translate/`  | Provider dispatch + LLM integration: `dispatchTranslate`, bianxie.ai adapter, document pipeline helpers, PDF upload Hono routes (`from-url` + presign) (see `translate/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- **Add routes in `index.ts`**, then delegate to a handler in the appropriate subdir. Keep `index.ts` as a thin router.
- **Every route that reads user identity** goes through `createAuth(c.env).api.getSession(...)` (preferably via the shared `attachSession` middleware) — never trust a client-provided userId.
- **CORS** is per-route (`/api/identity/*`, `/orpc/*`, `/api/translate/document/*`, `/ai/*`) and driven by `env.ALLOWED_EXTENSION_ORIGINS` (comma-separated; supports `chrome-extension://*` wildcard). Keep credentialed CORS — the extension relies on session cookies.
- **Use `logger.{info,warn,error}` from `analytics/logger.ts`**. Bare `console.warn` / `console.error` is enforced against by `analytics/__tests__/console-audit.test.ts`.
- When you add a scheduled job, register it in `worker.ts` inside the `Promise.allSettled` block and add a vitest under `scheduled/__tests__/`.
- **Sentry** is opt-in via `env.SENTRY_DSN`; `withSentry` wraps the entire handler so unhandled errors in any of `fetch` / `scheduled` / `queue` are reported.

### Testing Requirements

- Tests under `__tests__/` and each subdir. Use `utils/test-db.ts` to create an in-memory DB with all migrations applied.
- Webhook tests construct signed payloads with the real signature helpers — never skip signature verification.
- Cross-cutting integration tests (rate-limit, console audit) live in `__tests__/` directly so they can walk `src/**`.

## Dependencies

### Internal

- `@getu/contract` — oRPC routes (consumed in `orpc/`).
- `@getu/db` — Drizzle schema + `createDb()`.

### External

- `hono`, `better-auth`, `@orpc/server`, `drizzle-orm`, `zod`.
- `@sentry/cloudflare` — `withSentry` handler wrapper.
- `aws4fetch`, `pdf-lib`, `unpdf` — PDF presign + extraction.

<!-- MANUAL: -->
