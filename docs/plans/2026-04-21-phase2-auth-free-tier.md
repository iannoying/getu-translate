# Phase 2 · Independent Auth + Free Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent roadmap:** `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md`
> **Precursor plan:** `docs/plans/2026-04-20-phase1-brand-and-monorepo.md` (Phase 1, merged)
> **Extension-side legacy plan:** `docs/plans/2026-04-20-m0-commercialization.md` — written when the extension assumed an external backend. Phase 2 **supersedes** that plan's Tasks 1–8 (we now own the backend). Its contract file `docs/contracts/billing.md` remains the authoritative wire-format spec.

**Goal:** Stand up GetU Translate's own auth + entitlements backend end-to-end so that a user can sign in on `getutranslate.com`, and the extension can fetch `billing.getEntitlements` returning a Free-tier `Entitlements` object. No paid features yet, no AI key proxy — Phase 3 / Phase 4's jobs.

**Architecture (all-Cloudflare — finalized 2026-04-21):**
- **Data layer:** Cloudflare D1 (SQLite at the edge) + Drizzle ORM (sqlite dialect). `packages/db` holds schema + migrations. Trade-offs accepted: no native Postgres transactions, 10GB per-DB cap — adequate for Phase 2. Migration to Neon deferred until Phase 3+ if/when AI usage-log analytics demand relational firepower; Drizzle's dialect-abstracting types keep that migration a `drizzle.config.ts` change + 1–2 SQL dialect tweaks.
- **Auth layer:** `better-auth` server on Hono (inside `apps/api`), backed by Drizzle + D1 binding. Sessions are HTTP-only cookies scoped to `.getutranslate.com` so `apps/web` (CF Pages) and `apps/api` (CF Workers) share them.
- **API layer:** oRPC router on Hono. First procedure is `billing.getEntitlements` — requires session, always returns Free-tier stub in Phase 2.
- **Contract layer:** `@getu/contract` gets a `billing.*` namespace defining input/output zod schemas + oRPC contract. Extension and API both consume it.
- **Extension:** Dexie cache + Jotai atom + `useEntitlements` hook with offline fallback. `authClient` (from Phase 0) keeps its `backgroundFetch` proxy; only `WEBSITE_URL` constant flips from `readfrog.app` → `getutranslate.com`.
- **Web:** Next.js `/log-in` page on Cloudflare Pages (via `@cloudflare/next-on-pages`), calling `better-auth/react` client pointed at `apps/api`.
- **M2 integration:** the local `useInputTranslationQuota` hook gets a **short-circuit** — if `useEntitlements().data.tier === 'pro'`, skip the Dexie counter entirely. Local counter remains as offline fallback for Free users.

**Tech Stack:** Cloudflare D1 (SQLite) · Drizzle ORM (sqlite) · `better-auth@^1` · Hono · oRPC · zod · Dexie · Jotai · Next.js 15 on Cloudflare Pages (`@cloudflare/next-on-pages`) · Cloudflare Workers (wrangler) — **one provider, one bill, one DNS zone**

**Out of scope (later phases):**
- AI key proxy + server-side quota enforcement → Phase 3
- Paddle / Stripe checkout + subscription lifecycle → Phase 4
- Real-user billing UI beyond signed-in-tier display → Phase 4
- PostHog feature flags → defer; old M0 Task 4 is a nice-to-have not a blocker

**Duration estimate:** 6 weeks single person, including DNS / infra cutover.

---

## Pre-flight

- Main is Phase 1 complete: `apps/extension`, `apps/web`, `apps/api`, `packages/{definitions,contract,db}` all exist.
- External accounts provisioned (all inside one Cloudflare account):
  - `wrangler d1 create getu-translate` → capture `database_id` → paste into `apps/api/wrangler.toml` `[[d1_databases]]` block
  - `api.getutranslate.com` and `getutranslate.com` DNS records live in CF (zone already present since domain is registered there); will be wired to Worker and Pages respectively in Task 11
  - **No Neon. No Vercel.** Everything on Cloudflare. If later phases outgrow D1 or Pages, migrate component-by-component.
- All commits per Phase 1 convention: conventional commits, `pnpm --filter <pkg>` scripts, one Task = one branch = one PR.
- GitHub `allow_auto_merge` is still off (Free-plan private repo limitation); controller merges after CI green.
- Each Task opens one GitHub issue + PR. Issues created by controller at plan-execution start.

---

## File Structure (new / modified)

```
packages/db/
  drizzle.config.ts           # new  — dialect: sqlite, out: ./drizzle
  package.json                # modified  — add drizzle-orm, drizzle-kit, @cloudflare/workers-types (for D1Database type)
  src/
    index.ts                  # modified  — export `createDb`, `schema`
    client.ts                 # new  — drizzle(D1Database binding) factory
    schema/
      auth.ts                 # new  — better-auth tables via drizzle-orm/sqlite-core (text, integer)
      index.ts                # new  — re-export schema
  drizzle/                    # new  — generated SQL migrations (committed, applied via `wrangler d1 execute`)

@getu/contract/
  src/
    billing.ts                # new  — billing.* zod schemas + oRPC contract
    index.ts                  # modified  — re-export billing

apps/api/
  src/
    index.ts                  # modified  — mount better-auth + oRPC routers
    auth.ts                   # new  — better-auth server instance (Drizzle adapter, cookie config)
    orpc/
      index.ts                # new  — oRPC router root
      billing.ts              # new  — billing.getEntitlements procedure
    env.ts                    # new  — runtime env var parsing (DATABASE_URL, AUTH_SECRET)
  wrangler.toml               # modified  — env vars, routes (api.getutranslate.com)
  package.json                # modified  — add better-auth, drizzle-orm, @orpc/server, @getu/db, @getu/contract

apps/web/
  app/
    log-in/page.tsx           # modified  — real better-auth client
  lib/
    auth-client.ts            # new  — better-auth/react client pointed at apps/api
  package.json                # modified  — add better-auth, next-auth stub deps if any
  next.config.ts              # modified  — env passthrough

apps/extension/
  src/
    types/entitlements.ts     # new  — zod schema + predicates (was in legacy M0 plan)
    utils/
      constants/url.ts        # modified  — switch WEBSITE_URL to getutranslate.com
      db/dexie/app-db.ts      # modified  — register entitlements_cache table
      db/dexie/tables/entitlements-cache.ts  # new
      atoms/entitlements.ts   # new  — Jotai atom
    hooks/
      use-entitlements.ts     # new
    entrypoints/selection.content/input-translation/quota/
      use-input-quota.ts      # modified  — short-circuit via useEntitlements
  package.json                # modified  — add @getu/contract usage (already linked from Phase 1)
```

---

## Task Overview

| # | Title | Scope | Estimate |
|---|---|---|---|
| 1 | `packages/db`: Drizzle + Neon + better-auth schema | Backend | 1d |
| 2 | `@getu/contract`: billing namespace (zod + oRPC) | Shared | 0.5d |
| 3 | `apps/api`: better-auth server + session cookie config | Backend | 2d |
| 4 | `apps/api`: oRPC server scaffold on Hono | Backend | 0.5d |
| 5 | `apps/api`: `billing.getEntitlements` procedure (Free stub, TDD) | Backend | 1d |
| 6 | `apps/extension`: `types/entitlements.ts` + Dexie `entitlements_cache` | Frontend | 1d |
| 7 | `apps/extension`: `useEntitlements` hook + Jotai atom | Frontend | 1d |
| 8 | `apps/web`: `/log-in` page wired to better-auth | Frontend | 1d |
| 9 | `apps/extension`: `WEBSITE_URL` cutover to `getutranslate.com` + e2e login smoke | Integration | 0.5d |
| 10 | M2 integration: `useInputTranslationQuota` short-circuits on Pro | Integration | 0.5d |
| 11 | Deploy: apps/api → CF Workers, apps/web → Vercel, DNS cutover | Infra | 1d |

**Total ≈ 10 working days (2 calendar weeks of focused work); realistic 6 weeks with review/iterate/deploy.**

**Critical path:** 1 → 3 → 4 → 5 → 6 → 7 → 9 → 11
**Parallelizable after 1/2:** 3 (after 1), 6 (after 2), 8 (after 3)
**Last:** 10 (after 7), 11 (production deploy)

---

## Task 1: `packages/db` — Drizzle + Neon + better-auth schema

**Files:**
- Modify: `packages/db/package.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/schema/auth.ts`
- Create: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/drizzle/0000_init.sql` (generated)

- [ ] **Step 1: Add deps**

```bash
cd /Users/pengyu/workspace/app/getu-translate
pnpm add -F @getu/db drizzle-orm
pnpm add -F @getu/db -D drizzle-kit @cloudflare/workers-types
```

Expected: `packages/db/package.json` `dependencies: { "drizzle-orm": "^..." }` + `devDependencies: { "drizzle-kit": "^...", "@cloudflare/workers-types": "^..." }`.

- [ ] **Step 2: `packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit"

/**
 * Drizzle config for local migration generation.
 * Production migrations are applied via `wrangler d1 execute <db> --file=./drizzle/000N_<name>.sql`.
 * The `dbCredentials.url` here points at a local SQLite file used only to let drizzle-kit
 * introspect / generate SQL — it is NOT the production DB.
 */
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "better-sqlite3",
  dbCredentials: {
    url: "./.drizzle-local.sqlite",
  },
  verbose: true,
  strict: true,
})
```

(Add `.drizzle-local.sqlite` and `*.sqlite-journal` to `packages/db/.gitignore`.)

- [ ] **Step 3: `packages/db/src/client.ts`**

```ts
import { drizzle } from "drizzle-orm/d1"
import type { D1Database } from "@cloudflare/workers-types"
import * as schema from "./schema"

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>
```

- [ ] **Step 4: `packages/db/src/schema/auth.ts` — better-auth canonical tables**

Follow better-auth's Drizzle adapter docs for exact columns (https://better-auth.com/docs/adapters/drizzle). Minimum 4 tables: `user`, `session`, `account`, `verification`. Expose each as a `pgTable(...)` export.

**Reference shape (verify against current better-auth release before committing)**:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

// SQLite has no native timestamp type; use INTEGER (unix epoch ms) and convert in app layer.
const unixMsDefault = sql`(CAST(unixepoch('now','subsec') * 1000 AS INTEGER))`

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})
```

**Before committing, cross-reference with better-auth's current Drizzle-SQLite adapter requirements** (https://better-auth.com/docs/adapters/drizzle) — schema field names must match exactly. If better-auth expects a column name that differs, change the column and keep the camelCase property.

- [ ] **Step 5: `packages/db/src/schema/index.ts`**

```ts
export * from "./auth"
```

- [ ] **Step 6: `packages/db/src/index.ts`**

```ts
export { createDb, type Db } from "./client"
export * as schema from "./schema"
```

- [ ] **Step 7: Generate initial migration**

Set `DATABASE_URL` env var (pointing at a Neon branch reserved for schema-gen), then:

```bash
pnpm --filter @getu/db exec drizzle-kit generate --name init
```

Commit the generated `drizzle/0000_init.sql`. Do NOT run `drizzle-kit push` yet — deployment task pushes to production.

- [ ] **Step 8: Verify**

```bash
pnpm -r type-check
pnpm --filter @getu/extension build  # unaffected
```

- [ ] **Step 9: Commit + PR**

```bash
git switch -c feat/phase2-task-1-db-schema
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): add Drizzle + Neon config and better-auth schema"
gh pr create --base main --title "feat(db): add Drizzle + Neon config and better-auth schema" --body "Closes #<issue>"
```

---

## Task 2: `@getu/contract` — `billing` namespace

**Files:**
- Create: `packages/contract/src/billing.ts`
- Modify: `packages/contract/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/contract/src/__tests__/billing.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { EntitlementsSchema, FREE_ENTITLEMENTS } from "../billing"

describe("@getu/contract billing", () => {
  it("FREE_ENTITLEMENTS parses", () => {
    expect(() => EntitlementsSchema.parse(FREE_ENTITLEMENTS)).not.toThrow()
  })

  it("rejects invalid tier", () => {
    expect(() => EntitlementsSchema.parse({ tier: "gold", features: [], quota: {}, expiresAt: null })).toThrow()
  })
})
```

Run: `pnpm --filter @getu/contract test` → FAIL (module missing).

- [ ] **Step 2: `packages/contract/src/billing.ts`**

```ts
import { z } from "zod"
import { oc } from "@orpc/contract"

export const FeatureKey = z.enum([
  "pdf_translate",
  "input_translate_unlimited",
  "vocab_unlimited",
  "vocab_cloud_sync",
  "ai_translate_pool",
  "subtitle_platforms_extended",
  "enterprise_glossary_share",
])
export type FeatureKey = z.infer<typeof FeatureKey>

export const QuotaBucketSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
})

export const EntitlementsSchema = z.object({
  tier: z.enum(["free", "pro", "enterprise"]),
  features: z.array(FeatureKey),
  quota: z.record(z.string(), QuotaBucketSchema),
  expiresAt: z.string().datetime().nullable(),
})
export type Entitlements = z.infer<typeof EntitlementsSchema>

export const FREE_ENTITLEMENTS: Entitlements = {
  tier: "free",
  features: [],
  quota: {},
  expiresAt: null,
}

export function hasFeature(e: Entitlements, f: FeatureKey): boolean {
  return e.features.includes(f)
}

export function isPro(e: Entitlements): boolean {
  if (e.tier === "free") return false
  if (e.expiresAt == null) return e.tier === "enterprise"
  return Date.parse(e.expiresAt) > Date.now()
}

/** oRPC contract — server implements, client consumes */
export const billingContract = oc.router({
  getEntitlements: oc
    .input(z.object({}).strict())
    .output(EntitlementsSchema),
})
```

- [ ] **Step 3: Modify `packages/contract/src/index.ts`** — add explicit named re-exports of the new symbols following the existing index.ts pattern (don't `export *`).

- [ ] **Step 4: Re-run test** → PASS

- [ ] **Step 5: Verify**

```bash
pnpm -r type-check
```

- [ ] **Step 6: Commit + PR**

```bash
git commit -m "feat(contract): add billing.getEntitlements procedure and entitlements schema"
```

---

## Task 3: `apps/api` — better-auth server + session cookies

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/auth.ts`
- Create: `apps/api/src/env.ts`
- Modify: `apps/api/wrangler.toml`

- [ ] **Step 1: Add deps**

```bash
pnpm add -F @getu/api better-auth @getu/db@workspace:* @getu/contract@workspace:*
```

- [ ] **Step 2: `apps/api/src/env.ts`**

```ts
import { z } from "zod"
import type { D1Database } from "@cloudflare/workers-types"

/** Workers env bindings.
 *  D1 is injected as a binding (not a URL). Secrets come from `wrangler secret put`. */
export interface WorkerEnv {
  DB: D1Database
  AUTH_SECRET: string
  AUTH_BASE_URL: string
  ALLOWED_EXTENSION_ORIGINS: string
}

export const SecretsSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_BASE_URL: z.string().url(),
  ALLOWED_EXTENSION_ORIGINS: z.string(),
})

export function parseSecrets(env: WorkerEnv) {
  return SecretsSchema.parse({
    AUTH_SECRET: env.AUTH_SECRET,
    AUTH_BASE_URL: env.AUTH_BASE_URL,
    ALLOWED_EXTENSION_ORIGINS: env.ALLOWED_EXTENSION_ORIGINS,
  })
}
```

- [ ] **Step 3: `apps/api/src/auth.ts`**

```ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createDb, schema } from "@getu/db"
import type { WorkerEnv } from "./env"
import { parseSecrets } from "./env"

export function createAuth(env: WorkerEnv) {
  const secrets = parseSecrets(env)
  const db = createDb(env.DB)
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: secrets.AUTH_SECRET,
    baseURL: secrets.AUTH_BASE_URL,
    emailAndPassword: { enabled: true },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    advanced: {
      cookies: {
        sessionToken: { attributes: { domain: ".getutranslate.com", sameSite: "lax", secure: true } },
      },
    },
    trustedOrigins: secrets.ALLOWED_EXTENSION_ORIGINS.split(",").map(s => s.trim()),
  })
}
```

- [ ] **Step 4: Modify `apps/api/src/index.ts`**

```ts
import { Hono } from "hono"
import { cors } from "hono/cors"
import { createAuth } from "./auth"
import type { WorkerEnv } from "./env"

const app = new Hono<{ Bindings: WorkerEnv }>()

app.use("*", cors({
  origin: origin => origin, // reflected; exact allowlist enforced by better-auth trustedOrigins
  credentials: true,
}))

app.get("/health", c => c.json({ ok: true, service: "getu-api" }))

app.all("/api/identity/*", async (c) => {
  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})

export default app
```

- [ ] **Step 5: `apps/api/wrangler.toml` env binding**

Add placeholder `[vars]` and note real secrets come from `wrangler secret put`:

```toml
name = "getu-api"
main = "src/index.ts"
compatibility_date = "2026-04-20"
compatibility_flags = ["nodejs_compat"]

[dev]
port = 8788

[[d1_databases]]
binding = "DB"
database_name = "getu-translate"
database_id = "<fill from `wrangler d1 create getu-translate` output>"

[vars]
AUTH_BASE_URL = "http://localhost:8788"
ALLOWED_EXTENSION_ORIGINS = "chrome-extension://*,http://localhost:3000,https://getutranslate.com,https://www.getutranslate.com"
```

`AUTH_SECRET` only set via `wrangler secret put AUTH_SECRET` per-environment (never in toml). `DB` is a D1 binding, not a secret.

- [ ] **Step 6: Local smoke test**

Create `apps/api/.dev.vars` (gitignored; already covered by `.gitignore`):
```
AUTH_SECRET=<openssl rand -base64 32>
```

D1 runs locally via `wrangler dev`'s embedded miniflare — no separate DATABASE_URL. Apply the initial migration against the local D1:

```bash
pnpm --filter @getu/api exec wrangler d1 execute getu-translate --local --file=../../packages/db/drizzle/0000_init.sql
```

```bash
pnpm --filter @getu/api dev &
sleep 6
curl -s http://localhost:8788/health
# Expected: {"ok":true,"service":"getu-api"}
curl -s http://localhost:8788/api/identity/get-session
# Expected: 200 with empty session object
kill %1
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(api): integrate better-auth server with Drizzle adapter"
```

---

## Task 4: `apps/api` — oRPC server scaffold

**Files:**
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/orpc/index.ts`
- Modify: `apps/api/package.json` (add `@orpc/server`)

- [ ] **Step 1: Add dep**

```bash
pnpm add -F @getu/api @orpc/server
```

- [ ] **Step 2: `apps/api/src/orpc/index.ts`**

```ts
import { os } from "@orpc/server"
import type { WorkerEnv } from "../env"
import { createAuth } from "../auth"

export interface Ctx {
  env: WorkerEnv
  auth: ReturnType<typeof createAuth>
  session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>> | null
}

export const authed = os.$context<Ctx>().middleware(async ({ context, next, errors }) => {
  if (context.session == null) throw errors.UNAUTHORIZED()
  return next({ context: { ...context, session: context.session } })
})

// Router root — procedures added in Task 5+
export const router = os.$context<Ctx>().router({})
export type Router = typeof router
```

- [ ] **Step 3: Wire oRPC handler into Hono**

In `apps/api/src/index.ts`:

```ts
import { RPCHandler } from "@orpc/server/fetch"
import { router } from "./orpc"

const rpcHandler = new RPCHandler(router)

app.all("/orpc/*", async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null)
  const ctx = { env: c.env, auth, session }
  const { response } = await rpcHandler.handle(c.req.raw, { prefix: "/orpc", context: ctx })
  return response ?? c.notFound()
})
```

- [ ] **Step 4: Smoke test** — `curl http://localhost:8788/orpc` returns 404 (empty router); no crash.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(api): scaffold oRPC router with auth middleware"
```

---

## Task 5: `apps/api` — `billing.getEntitlements` procedure (TDD)

**Files:**
- Create: `apps/api/src/orpc/billing.ts`
- Create: `apps/api/src/orpc/__tests__/billing.test.ts`
- Modify: `apps/api/src/orpc/index.ts`

- [ ] **Step 1: Write failing test**

`apps/api/src/orpc/__tests__/billing.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createRouterClient } from "@orpc/server"
import { router } from "../index"
import type { Ctx } from "../index"

function ctx(session: Ctx["session"]): Ctx {
  return { env: {} as Ctx["env"], auth: {} as Ctx["auth"], session }
}

describe("billing.getEntitlements", () => {
  it("returns free tier for any signed-in user", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1" } } as any),
    })
    const e = await client.billing.getEntitlements({})
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
    expect(e.expiresAt).toBeNull()
  })

  it("rejects anonymous", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(client.billing.getEntitlements({})).rejects.toThrow()
  })
})
```

Run: `pnpm --filter @getu/api test` → FAIL (`billing` not in router).

- [ ] **Step 2: `apps/api/src/orpc/billing.ts`**

```ts
import { FREE_ENTITLEMENTS, billingContract } from "@getu/contract"
import { authed } from "./index"

export const billingRouter = {
  getEntitlements: authed.handler(async () => FREE_ENTITLEMENTS),
}
```

- [ ] **Step 3: Wire into router** — modify `apps/api/src/orpc/index.ts`:

```ts
import { billingRouter } from "./billing"

export const router = os.$context<Ctx>().router({
  billing: billingRouter,
})
```

- [ ] **Step 4: Re-run test** → PASS (2 passed)

- [ ] **Step 5: Verify full workspace**

```bash
pnpm -r type-check
pnpm --filter @getu/api test
pnpm --filter @getu/extension build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(api): add billing.getEntitlements procedure (Free tier stub, TDD)"
```

---

## Task 6: Extension — `types/entitlements.ts` + Dexie `entitlements_cache`

**Files:**
- Create: `apps/extension/src/types/entitlements.ts` (re-export from `@getu/contract`)
- Create: `apps/extension/src/utils/db/dexie/tables/entitlements-cache.ts`
- Modify: `apps/extension/src/utils/db/dexie/app-db.ts` (bump version, register table)
- Create: `apps/extension/src/utils/db/dexie/__tests__/entitlements-cache.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/extension/src/utils/db/dexie/__tests__/entitlements-cache.test.ts
import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"
import { appDb } from "../app-db"
import { readCachedEntitlements, writeCachedEntitlements } from "../tables/entitlements-cache"

describe("entitlements-cache", () => {
  beforeEach(async () => { await appDb.entitlementsCache.clear() })

  it("round-trips entitlements by userId", async () => {
    const e = { tier: "pro" as const, features: ["pdf_translate" as const], quota: {}, expiresAt: "2099-01-01T00:00:00.000Z" }
    await writeCachedEntitlements("u1", e)
    const got = await readCachedEntitlements("u1")
    expect(got?.value).toEqual(e)
  })

  it("returns null for unknown user", async () => {
    expect(await readCachedEntitlements("missing")).toBeNull()
  })
})
```

- [ ] **Step 2: Implement `tables/entitlements-cache.ts`**

```ts
import type { Entitlements } from "@getu/contract"
import { appDb } from "../app-db"

export interface CachedEntitlements {
  userId: string
  value: Entitlements
  updatedAt: number
}

export async function writeCachedEntitlements(userId: string, value: Entitlements) {
  await appDb.entitlementsCache.put({ userId, value, updatedAt: Date.now() })
}

export async function readCachedEntitlements(userId: string): Promise<CachedEntitlements | null> {
  return (await appDb.entitlementsCache.get(userId)) ?? null
}

export async function deleteCachedEntitlements(userId: string) {
  await appDb.entitlementsCache.delete(userId)
}
```

- [ ] **Step 3: Register in `app-db.ts`**

Follow existing pattern (Dexie version bump; declare table in the schema upgrade block).

- [ ] **Step 4: `types/entitlements.ts`**

```ts
export {
  EntitlementsSchema,
  FREE_ENTITLEMENTS,
  hasFeature,
  isPro,
  type Entitlements,
  type FeatureKey,
} from "@getu/contract"
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(extension): add entitlements types and Dexie entitlements_cache table"
```

---

## Task 7: Extension — `useEntitlements` hook + Jotai atom

**Files:**
- Create: `apps/extension/src/utils/atoms/entitlements.ts`
- Create: `apps/extension/src/hooks/use-entitlements.ts`
- Create: `apps/extension/src/hooks/__tests__/use-entitlements.test.tsx`

- [ ] **Step 1: Write failing test (React Testing Library)**

```tsx
// __tests__/use-entitlements.test.tsx
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useEntitlements } from "../use-entitlements"

vi.mock("@/utils/orpc/client", () => ({
  orpcClient: { billing: { getEntitlements: vi.fn() } },
}))

describe("useEntitlements", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns FREE for anonymous user", async () => {
    const { result } = renderHook(() => useEntitlements(null))
    await waitFor(() => expect(result.current.data.tier).toBe("free"))
  })

  it("returns server entitlements on success", async () => {
    const { orpcClient } = await import("@/utils/orpc/client")
    ;(orpcClient.billing.getEntitlements as any).mockResolvedValue({
      tier: "pro", features: ["pdf_translate"], quota: {}, expiresAt: "2099-01-01T00:00:00.000Z",
    })
    const { result } = renderHook(() => useEntitlements("u1"))
    await waitFor(() => expect(result.current.data.tier).toBe("pro"))
  })

  it("falls back to Dexie cache on network error", async () => {
    const { orpcClient } = await import("@/utils/orpc/client")
    ;(orpcClient.billing.getEntitlements as any).mockRejectedValue(new Error("offline"))
    const { writeCachedEntitlements } = await import("@/utils/db/dexie/tables/entitlements-cache")
    await writeCachedEntitlements("u1", { tier: "pro", features: [], quota: {}, expiresAt: "2099-01-01T00:00:00.000Z" })
    const { result } = renderHook(() => useEntitlements("u1"))
    await waitFor(() => expect(result.current.data.tier).toBe("pro"))
  })
})
```

- [ ] **Step 2: Implement `atoms/entitlements.ts`**

```ts
import { atom } from "jotai"
import { FREE_ENTITLEMENTS, type Entitlements } from "@/types/entitlements"

export const entitlementsAtom = atom<Entitlements>(FREE_ENTITLEMENTS)
```

- [ ] **Step 3: Implement `hooks/use-entitlements.ts`**

Behavior (matches `docs/contracts/billing.md` §4.1):
1. Anonymous (`userId == null`) → return FREE_ENTITLEMENTS synchronously.
2. `useQuery(["entitlements", userId], () => orpcClient.billing.getEntitlements({}))`:
   - On success: write to Dexie + Jotai atom, return data.
   - On error: read Dexie cache; if present return cached; else return FREE_ENTITLEMENTS.
3. Expose `{ data, isLoading, isError }`.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @getu/extension test src/hooks/__tests__/use-entitlements.test.tsx
pnpm --filter @getu/extension type-check
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(extension): add useEntitlements hook with Dexie offline fallback"
```

---

## Task 8: `apps/web` — `/log-in` with better-auth client

**Files:**
- Create: `apps/web/lib/auth-client.ts`
- Modify: `apps/web/app/log-in/page.tsx`
- Modify: `apps/web/package.json` (add `better-auth`)
- Modify: `apps/web/next.config.ts` (env passthrough if needed)

- [ ] **Step 1: Add dep**

```bash
pnpm add -F @getu/web better-auth
```

- [ ] **Step 2: `apps/web/lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8788",
})
```

- [ ] **Step 3: Rewrite `apps/web/app/log-in/page.tsx`**

A minimal client-side sign-in form (email + password) that calls `authClient.signIn.email(...)` on submit. Redirect to `/` on success. Show error text on failure. No styling beyond plain HTML — Phase 4 does UI polish.

Use `"use client"` directive.

- [ ] **Step 4: Env template update**

Ensure `apps/web/.env.local.example` has `NEXT_PUBLIC_API_BASE_URL` (already added in Phase 1 Task 11).

- [ ] **Step 5: Smoke**

Start `apps/api` on :8788 with `.dev.vars`, start `apps/web` on :3000, manually sign up via `authClient.signUp.email(...)` in browser DevTools, then sign in via the form. Confirm session cookie is set with domain `.getutranslate.com` (in prod) or `localhost` (in dev).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(web): wire /log-in page to better-auth client"
```

---

## Task 9: Extension — `WEBSITE_URL` cutover to `getutranslate.com`

**Files:**
- Modify: `packages/definitions/src/index.ts` (already points at getutranslate.com — verify)
- Verify: `apps/extension/src/utils/auth/auth-client.ts` uses `WEBSITE_URL`
- Create: `apps/extension/src/utils/auth/__tests__/auth-client.test.ts` (smoke)

- [ ] **Step 1: Sanity check**

```bash
grep -n "WEBSITE_URL" apps/extension/src/utils/auth/auth-client.ts
grep -n "WEBSITE_PROD_URL" packages/definitions/src/index.ts
```

Should already equal `https://getutranslate.com` from Phase 1 Task 5. If not, fix it and note why it regressed.

- [ ] **Step 2: Manual e2e smoke (Chrome)**

1. Run `pnpm --filter @getu/api dev` (localhost:8788)
2. Run `pnpm --filter @getu/web dev` (localhost:3000)
3. Run `pnpm --filter @getu/extension dev` — Chrome opens with extension loaded
4. In extension options, click "Sign in" — browser opens `https://getutranslate.com/log-in`. For dev, temporarily swap `WEBSITE_PROD_URL` via `.env.local` to `http://localhost:3000`.
5. Sign in on the web page → redirect back to home.
6. Open extension options → `useEntitlements` returns `{ tier: "free", features: [] }` via oRPC round-trip.
7. Confirm Dexie `entitlementsCache` has a row for the user id.

**If any step fails, isolate: cookie domain? CORS preflight? extension background fetch? Write up the failure in BLOCKER and stop.**

- [ ] **Step 3: Document dev-override pattern**

Add to `apps/extension/src/utils/auth/AGENTS.md` a short note: to override `WEBSITE_URL` for local Workers/Next dev, use `WXT_USE_LOCAL_PACKAGES=true` (already triggers a different dev URL branch).

- [ ] **Step 4: Commit**

```bash
git commit -m "test(auth): verify end-to-end sign-in flow against apps/api"
```

(Code change is likely zero if Phase 1 set `WEBSITE_URL` correctly; PR is mostly docs + test.)

---

## Task 10: M2 integration — `useInputTranslationQuota` ⇄ `useEntitlements`

**Files:**
- Modify: `apps/extension/src/entrypoints/selection.content/input-translation/quota/use-input-quota.ts`
- Modify: `apps/extension/src/entrypoints/selection.content/input-translation/quota/__tests__/use-input-quota.test.tsx`

**Behavior contract:**
- If `useEntitlements().data.tier === "pro"` **or** `data.features` contains `"input_translate_unlimited"` → bypass Dexie counter entirely; always allow.
- Otherwise: use existing Dexie 50/day counter.
- If `useEntitlements` is `isLoading`: optimistic deny (use existing counter, same as Free). Do not hang the UI.

- [ ] **Step 1: Update test fixtures**

Add a test case: Pro user is never blocked, even after 51 attempts in a day.

```tsx
it("Pro tier user is never quota-gated", async () => {
  mockUseEntitlements({ tier: "pro", features: ["input_translate_unlimited"], quota: {}, expiresAt: null })
  for (let i = 0; i < 60; i++) {
    const { result } = renderHook(() => useInputTranslationQuota())
    expect(result.current.canConsume()).toBe(true)
  }
})
```

- [ ] **Step 2: Implement short-circuit**

At the top of `useInputTranslationQuota`:

```ts
const { data: ent } = useEntitlements(/* current user id */)
const isPro = isProTier(ent) || ent.features.includes("input_translate_unlimited")
if (isPro) {
  return {
    canConsume: () => true,
    consume: async () => {},
    used: 0,
    limit: null,
  }
}
// ... existing Dexie counter logic
```

Make sure the hook still reads the same cache key for Free users (no behavior change there).

- [ ] **Step 3: Verify**

```bash
pnpm --filter @getu/extension test apps/extension/src/entrypoints/selection.content/input-translation/
pnpm --filter @getu/extension build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(input): integrate useInputTranslationQuota with Phase 2 useEntitlements"
```

---

## Task 11: Deploy — All-Cloudflare (D1 + Workers + Pages)

**No code — operations only.** Everything inside one CF account; DNS needs zero external coordination. Create an issue-backed checklist PR with the runbook notes.

- [ ] **D1 production database provisioned**:
  ```bash
  wrangler d1 create getu-translate
  # Copy the printed database_id into apps/api/wrangler.toml [[d1_databases]]
  ```
- [ ] **Apply initial migration to production D1**:
  ```bash
  wrangler d1 execute getu-translate --remote --file=packages/db/drizzle/0000_init.sql
  wrangler d1 execute getu-translate --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
  # Expect: user, session, account, verification
  ```
- [ ] **apps/api → Workers deploy**:
  ```bash
  pnpm --filter @getu/api exec wrangler secret put AUTH_SECRET
  # paste: output of `openssl rand -base64 32`
  pnpm --filter @getu/api deploy
  ```
  In CF dashboard → Workers → `getu-api` → Triggers → add custom domain `api.getutranslate.com`.
- [ ] **apps/web → Pages deploy (via `@cloudflare/next-on-pages`)**:
  ```bash
  pnpm add -F @getu/web -D @cloudflare/next-on-pages
  pnpm --filter @getu/web exec next-on-pages
  pnpm --filter @getu/web exec wrangler pages deploy .vercel/output/static --project-name=getu-web
  ```
  In CF dashboard → Pages → `getu-web` → Custom domains → add `getutranslate.com` + `www.getutranslate.com`. Set production env var `NEXT_PUBLIC_API_BASE_URL=https://api.getutranslate.com`.
- [ ] **DNS sanity**: both `api.getutranslate.com` (→ Worker) and `getutranslate.com` / `www` (→ Pages) resolve. `curl https://api.getutranslate.com/health` returns `{"ok":true,"service":"getu-api"}`.
- [ ] **Production smoke (end-to-end)**:
  1. Sign up via `https://getutranslate.com/log-in` (email+password).
  2. Confirm session cookie set for `.getutranslate.com` in browser devtools.
  3. Reload extension in Chrome; open Options → Account.
  4. `useEntitlements` returns `{ tier: "free", ... }` fetched from production `/orpc`.
- [ ] **Commit runbook**: `docs(deploy): phase 2 all-CF deploy runbook` → `docs/infra/phase2-deploy-runbook.md` containing the exact command sequence, screenshot links to dashboard steps, and any gotchas you hit (e.g., D1 binding ID typos, custom domain SSL cert timing, next-on-pages build quirks).

---

## Phase 2 Acceptance Criteria

- [ ] 10 code PRs merged (Tasks 1–10) + 1 docs PR (Task 11 runbook)
- [ ] `pnpm -r type-check && pnpm -r test && pnpm -r lint` all green
- [ ] `pnpm --filter @getu/extension build` green; extension loads in Chrome with no console errors on options page
- [ ] Production `https://api.getutranslate.com/health` returns `{ok:true,service:"getu-api"}`
- [ ] Signed-in user on `https://getutranslate.com` can see `useEntitlements` return `{tier:"free"}` from the extension
- [ ] Pro flag (manually toggled in Neon for a test user) causes M2 `useInputTranslationQuota` to skip the 50/day block
- [ ] No new plan-scope creep committed that wasn't in this plan or explicitly approved

---

## Risk Register

| Risk | Mitigation |
|---|---|
| better-auth cookie domain won't attach to `chrome-extension://<id>` origin | Keep the existing `backgroundFetch` proxy in extension `auth-client.ts`; all credentialed requests go through background which can set `Origin: https://getutranslate.com`. Confirmed working pattern in Phase 0. |
| D1 lacks real multi-statement transactions; better-auth signup writes several tables | Use `d1.batch([...])` via Drizzle's `db.batch([...])` for the signup path if better-auth exposes it; otherwise rely on D1's implicit per-statement atomicity + accept small-window inconsistency risk at this scale. Revisit if duplicate-insert complaints appear. |
| D1 10GB per-DB cap | Monitor via `wrangler d1 info` quarterly. If approaching 5GB, plan migration to Neon (Drizzle dialect swap + manual data export). Phase 2 usage (4 auth tables) will stay well under 100MB. |
| Drizzle schema drift from better-auth's expected shape | Lock better-auth minor version; cross-check schema field names against current better-auth adapter docs during Task 1; regenerate SQL and review diff after any better-auth upgrade. |
| `next-on-pages` build fails on certain Next.js features (Node.js runtime routes, unsupported middleware) | Phase 2's `apps/web` is minimal (one form page + client-side nav). Stick to edge runtime; if a blocker appears, fall back to `apps/web` as static export OR move to Pages Functions. |
| CF Workers request subrequest limits (50 in free, 1000 in paid) vs better-auth's multi-query signup | Measure after Task 3 — if signup makes >10 queries, batch via D1 batch API or move to paid Workers plan. |
| Phase 3 will override M2's `useInputTranslationQuota` with server-side `billing.consumeQuota` | Task 10 is a soft integration; Phase 3 replaces entirely. Leave comment in the hook noting the rewrite. |
| `WEBSITE_URL` flip requires `getutranslate.com` to be live for dev | Use `wrangler dev` + `wrangler pages dev` locally; extension's `WXT_USE_LOCAL_PACKAGES=true` branch can still point at `http://localhost:3000` / `http://localhost:8788` for offline iteration. |
| CF custom domain SSL cert provisioning can take minutes | Do the deploy during off-hours; verify with `curl -I https://api.getutranslate.com/health` before claiming Task 11 done. |

---

## Self-Review Notes

1. **Spec coverage:** All roadmap items for Phase 2 (independent auth, Free entitlements, web login, extension consumer, M2 integration, deploy) have a task.
2. **Placeholder scan:** No TBD / "similar to" — every code block is literal.
3. **Type consistency:** `Entitlements` is defined once in `@getu/contract/billing.ts`; `@getu/extension/types/entitlements.ts` re-exports. `FREE_ENTITLEMENTS` re-used across tasks.
4. **External dependencies:** Neon, CF Workers, Vercel — assumed provisioned per `docs/infra/README.md` before Task 1.
5. **Rollback:** any task can be reverted independently via `git revert <squashed-sha>`. Task 11 (deploy) needs a manual rollback plan in the runbook.

---

## Execution Handoff

Plan complete and saved. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, Claude + Codex review between tasks (per the `docs/plans/2026-04-20-phase1-brand-and-monorepo.md` pattern), auto-merge gated on CI green + review approvals.

**2. Inline** — I execute tasks in-session, with review checkpoints but no subagent isolation. Faster for trivial tasks; riskier for the CF Workers + better-auth + Drizzle novelties.

Recommend **(1)**. Same review policy as Phase 1:
- Codex review on Tasks 1, 3, 5, 7, 10 (substantial code)
- Skip Codex on Tasks 2, 4, 6, 8, 9, 11 (schemas, scaffolds, docs, integration smoke)

Waiting for your signal to create the 11 Phase 2 issues and start Task 1.
