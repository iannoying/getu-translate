<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# api

## Purpose

`@getu/api` — The GetU Translate backend, deployed as a Cloudflare Worker (`wrangler`). It is the single HTTP surface for:

- **Auth** (`/api/identity/*`) — better-auth handler: email+password, email OTP, passkey, Google/GitHub OAuth. Session cookie issued on the api origin and shared with the extension via credentialed CORS.
- **oRPC** (`/orpc/*`) — typed RPC server backed by the `@getu/contract` contract. Currently exposes `billing.*` (pricing, createCheckoutSession, entitlement/quota).
- **AI proxy** (`/ai/v1/*`) — OpenAI-compatible chat-completions proxy for Pro users. JWT-gated (short-lived token via `/ai/v1/token`) with rate-limiting and usage accounting.
- **Billing webhooks** (`/api/billing/webhook/{paddle,stripe}`) — signed webhook receivers that apply entitlement/subscription changes.
- **Scheduled handler** — Cron-triggered retention job (see `src/scheduled/retention.ts`) purging old usage rows.

The worker uses a Hono app mounted into both `fetch` and `scheduled` handlers via `src/worker.ts`.

## Key Files

| File                | Description                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `package.json`      | `@getu/api` manifest. Scripts: `dev`, `deploy` (Wrangler), `build`, `test` (vitest), `grant-pro`.             |
| `wrangler.toml`     | Worker bindings: D1, KV (rate-limit, sessions), secrets, scheduled triggers, env vars per environment.        |
| `tsconfig.json`     | TypeScript config for Workers runtime.                                                                       |
| `.dev.vars.example` | Template for local secrets (copy to `.dev.vars`).                                                             |
| `.env.local.example`| Template for `tsx`/node-side env vars used by scripts.                                                       |

## Subdirectories

| Directory   | Purpose                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/`      | Worker source (see `src/AGENTS.md`).                                                                                 |
| `scripts/`  | One-off TS scripts run via `tsx`. `grant-pro.ts` manually grants a user a Pro entitlement against the prod DB.        |

## For AI Agents

### Working In This Directory

- **Runtime is Cloudflare Workers.** Do NOT import Node-only APIs (`fs`, `path`, `http`, Buffer-heavy code). Use Web Crypto, `fetch`, `Request`/`Response`.
- Bindings are passed via `c.env` (Hono context) — typed by `WorkerEnv` in `src/env.ts`. Add new bindings to both `wrangler.toml` and `WorkerEnv`.
- **Never log PII or tokens.** The AI proxy is OpenAI-compatible; sanitize errors before logging.
- Webhook handlers MUST verify signatures before touching the DB.
- `createAuth(env)` returns a better-auth instance. Do not cache across requests — cold starts invalidate it anyway.

### Testing Requirements

- `pnpm --filter @getu/api test` runs vitest. Tests that touch the DB spin up an in-memory SQLite via `src/__tests__/utils/test-db.ts` (Drizzle over `better-sqlite3`).
- Billing tests mock Paddle/Stripe HTTP clients. Never hit real payment APIs.
- New billing/auth code should ship with a test in the matching `__tests__/` neighbour.

### Deployment

- `pnpm --filter @getu/api deploy` publishes to Cloudflare under `--env production` (critical: without `--env production`, secrets are different).
- Secrets managed via `wrangler secret put` (never commit `.dev.vars`).
- The extension points at `https://api.getutranslate.com` via `NEXT_PUBLIC_API_BASE_URL` baked at build time.

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
- `wrangler` + `@cloudflare/workers-types` — tooling + types.
- `vitest` + `better-sqlite3` — tests.

<!-- MANUAL: -->
