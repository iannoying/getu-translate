<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-08 -->

# api

## Purpose

`@getu/api` — The GetU Translate backend, deployed as a Cloudflare Worker (`wrangler`). Single HTTP surface for:

- **Auth** (`/api/identity/*`) — better-auth handler: email+password, email OTP, passkey, Google/GitHub OAuth. Session cookie issued on the api origin and shared with the extension via credentialed CORS.
- **oRPC** (`/orpc/*`) — typed RPC server against `@getu/contract`. Domains: `billing.*` (pricing, checkout, entitlements/quota), `translate.text.*` + `translate.document.*` (history, run, lifecycle), `analytics.track`.
- **AI proxy** (`/ai/v1/*`) — OpenAI-compatible chat-completions proxy for Pro users. Short-lived JWT minted at `/ai/v1/token`; KV-backed rate limit on every call.
- **Document upload** (`/api/translate/document/{presign,from-url}`) — Hono routes for the `/document` PDF pipeline (presigned R2 PUT + SSRF-guarded URL fetch).
- **Billing webhooks** (`/api/billing/webhook/{paddle,stripe}`) — signed receivers that apply entitlement/subscription changes.
- **Scheduled handler** — cron-triggered retention + translation lifecycle (cleanup/retry/stuck-sweep) + spend-monitor Slack alerts.
- **Queue consumer** — Cloudflare Queues (`TRANSLATE_QUEUE`) processes document translation jobs end-to-end.

The Worker is a single isolate handling `fetch`, `scheduled`, and `queue` events via `src/worker.ts`, wrapped in `withSentry` for error reporting.

## Key Files

| File                  | Description                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`        | `@getu/api` manifest. Scripts: `dev` (wrangler dev), `deploy` (`wrangler deploy --env production`), `build`, `test` (vitest), `smoke:prod` (post-deploy gate via `scripts/smoke-prod.ts`), `grant-pro`.                                                                                                                                                                                              |
| `wrangler.toml`       | Worker config + bindings: D1 (`DB`), KV (`RATE_LIMIT_KV`), R2 (`BUCKET_PDFS`), Queue producer + consumer (`TRANSLATE_QUEUE`), cron triggers, env-var overrides per `[env.production]`. KV namespace IDs differ between dev and prod; secrets live in Wrangler. |
| `tsconfig.json`       | TypeScript config for Workers runtime.                                                                                                                                                                                                                                                                                                                                                              |
| `DEPLOY-CHECKLIST.md` | Pre-deploy checklist (KV bindings, secrets, smoke step, rollback).                                                                                                                                                                                                                                                                                                                                  |
| `.dev.vars.example`   | Template for local Worker secrets (copy to `.dev.vars`).                                                                                                                                                                                                                                                                                                                                            |
| `.env.local.example`  | Template for `tsx`/node-side env vars used by scripts (e.g. `grant-pro`, `smoke-prod`).                                                                                                                                                                                                                                                                                                              |

## Subdirectories

| Directory  | Purpose                                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`     | Worker source (see `src/AGENTS.md`).                                                                                                                                                                                                                     |
| `scripts/` | Standalone TS scripts run via `tsx`. `grant-pro.ts` manually grants a Pro entitlement; `smoke-prod.ts` is the post-deploy HTTP smoke that gates the M7-A3 auto-rollback (CI runs it after every prod deploy). See `scripts/AGENTS.md`.                   |

## For AI Agents

### Working In This Directory

- **Runtime is Cloudflare Workers.** Do NOT import Node-only APIs (`fs`, `path`, `http`, raw `Buffer`). Use Web Crypto, `fetch`, `Request`/`Response`.
- **Bindings** are passed via `c.env` (Hono context), typed by `WorkerEnv` in `src/env.ts`. Adding a binding requires three edits: `WorkerEnv`, `wrangler.toml` (both top-level and `[env.production]` if it differs), and the `.dev.vars.example` template.
- **Secrets vs vars.** Use `wrangler secret put <NAME> --env production` for credentials (Paddle key, Stripe key, bianxie key, JWT signing secret, Slack webhook). Use `[env.production.vars]` in `wrangler.toml` for non-sensitive config (PostHog host, allowed origins, spend thresholds).
- **Use `logger.{info,warn,error}`** from `src/analytics/logger.ts` instead of bare `console.*` — the audit test will fail CI on new violations.
- **Never log PII or tokens.** The AI proxy is OpenAI-compatible; sanitize errors before logging. The logger gates PostHog forwarding to errors by default.
- Webhook handlers MUST verify signatures before touching the DB.
- `createAuth(env)` returns a better-auth instance. Do not cache it across requests — isolates are short-lived anyway.

### Testing Requirements

- `pnpm --filter @getu/api test` runs vitest. Tests that touch the DB spin up an in-memory SQLite via `src/__tests__/utils/test-db.ts` (Drizzle over `better-sqlite3`).
- Billing tests mock Paddle/Stripe HTTP clients. Never hit real payment APIs.
- The console-audit test (`src/analytics/__tests__/console-audit.test.ts`) walks `src/**/*.ts` and fails on bare `console.warn` / `console.error`. Route logs through the structured logger.
- New billing/auth code should ship with a test in the matching `__tests__/` neighbour.

### Deployment

- `pnpm --filter @getu/api deploy` publishes via `wrangler deploy --env production` (critical: without `--env production`, secrets and bindings are different).
- The CI pipeline (`.github/workflows/deploy-api.yml`) runs `pnpm smoke:prod` after deploy. If it exits non-zero, the workflow rolls back to the previous version (M7-A3). Test the rollback path by triggering with `force_smoke_fail=true`.
- The extension and web app point at `https://api.getutranslate.com` via `NEXT_PUBLIC_API_BASE_URL` baked at build time.
- Cron triggers (in `wrangler.toml`) drive `worker.ts`'s `scheduled` handler.

## Dependencies

### Internal

- `@getu/contract` — oRPC route/schema contract (server consumes, clients call).
- `@getu/db` — Drizzle schema + `createDb()` used by every DB-touching module.

### External

- `hono` — HTTP router.
- `better-auth` + `@better-auth/passkey` — auth backend (session, email OTP, passkey, OAuth).
- `@orpc/server` — oRPC runtime.
- `drizzle-orm` — DB layer (sqlite-core, D1 dialect).
- `zod` — schema validation.
- `@sentry/cloudflare` — `withSentry` handler wrapper.
- `aws4fetch`, `pdf-lib`, `unpdf` — R2 presign + PDF extraction.
- `wrangler` + `@cloudflare/workers-types` — tooling + types.
- `vitest` + `better-sqlite3` — tests.

<!-- MANUAL: -->
