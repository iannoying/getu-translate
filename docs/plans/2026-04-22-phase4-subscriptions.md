# Phase 4 · Paddle Subscriptions + Payment Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent roadmap:** [`docs/plans/2026-04-20-roadmap-vs-immersive-translate.md`](2026-04-20-roadmap-vs-immersive-translate.md)
> **Precursor plan:** [`docs/plans/2026-04-22-phase3-ai-proxy-quota.md`](2026-04-22-phase3-ai-proxy-quota.md) (merged; live at `api.getutranslate.com`)
> **Contract authority (to be v2'ed in T0):** [`docs/contracts/billing.md`](../contracts/billing.md)

**Goal:** Replace Phase 3's manual `grant-pro.ts` with Paddle Checkout → webhook → `user_entitlements` automatic flow. Ship feature-flagged behind `BILLING_ENABLED` so code lands on main before Paddle vendor approval completes. Absorb Phase 3 follow-ups (cron retention, usage_log field population, Pro expiry → provider disable).

**Architecture:**
- **Provider abstraction:** `user_entitlements` gets `billing_provider TEXT` discriminator + renamed `provider_customer_id` / `provider_subscription_id` (replacing `stripe_*`). Phase 4 implements Paddle only; Stripe is a future discriminator value.
- **Webhook:** Single Paddle endpoint `POST /api/billing/webhook/paddle` (Hono raw route, not oRPC). HMAC signature validation + idempotency via new `billing_webhook_events` table keyed on `event.id` (TTL 30 days). Shared `applyBillingEvent(db, userId, event)` normalizer writes `user_entitlements`.
- **Checkout:** oRPC `billing.createCheckoutSession` calls Paddle `POST /transactions` with `custom_data: { user_id }`, returns hosted checkout URL. Two launch points: extension `<UpgradeDialog>` opens Paddle URL in new tab; web `/price` Upgrade button opens same URL. Success page at `/upgrade/success` (web) + `upgrade-success.html` (extension entrypoint) polls `getEntitlements` until tier flips.
- **Feature flag:** `BILLING_ENABLED` env var. When `false`, `createCheckoutSession` returns 412 and UI buttons render "Coming soon" disabled. Paddle approval flip = one `wrangler secret put` + redeploy.
- **Grace period:** `grace_until` column writes on `subscription.past_due`, clears on `transaction.completed`. Entitlements expose it as optional field; Phase 4 does NOT render a banner (future UX work).

**Tech Stack:** Cloudflare Workers · D1 · Drizzle ORM (sqlite) · Hono · Paddle Billing API v2 · oRPC · Dexie · Jotai · WXT (extension) · Next.js static export (web)

**Out of scope:**
- Stripe integration (deferred — Phase 4 only implements the `billing_provider='paddle'` discriminator value)
- Grace period UI banner (field ships, banner deferred)
- Enterprise tier sales flow (Phase 6+)
- Refund webhooks / chargebacks (Paddle surfaces in dashboard; our webhook handler logs + ignores `adjustment.*`)
- `subscription.trialing` / trial-period support (no trial offered in current pricing)

**Duration estimate:** 6.5 working days.

---

## Pre-flight

- Main = Phase 3 complete through commit `a54118a`; Paddle审核 page shipped via #89.
- D1 `database_id = 903fa2ef-2aaa-4f20-b3a7-a2ef59a8cb70`; Phase 3 tables `user_entitlements` / `usage_log` / `quota_period` live.
- **New external dependency:** Paddle Sandbox account (separate from prod pending approval).
  - Sandbox vendor: create at https://sandbox-vendors.paddle.com → grab API key + webhook secret.
  - Sandbox prices: create a "GetU Pro" product with two prices (monthly $8, yearly $72) — IDs look like `pri_01...`.
  - `wrangler secret put PADDLE_API_KEY` (and others) into `apps/api` for **dev `.dev.vars`** AND `--env production` (sandbox values until real approval).
- Operational convention: all `wrangler` commands prefixed with `HTTP_PROXY="" HTTPS_PROXY="" NO_PROXY="*.cloudflare.com,*.pages.dev,*.workers.dev"` ([memory](../agents/memory/project_cf_deploy_lessons.md)).
- Each task: independent worktree + branch + PR.
- Reviewers: Claude `code-reviewer` + `general-purpose` (spec compliance), both `model=sonnet`. **No Codex** ([memory](../agents/memory/feedback_no_codex_review.md)).
- Plan execution style: subagent-driven, fresh worktree per task.

---

## File Structure (new / modified)

```
packages/contract/
  src/
    billing.ts                              # modified — Entitlements +graceUntil/+billingEnabled/+billingProvider; +createCheckoutSession/+createPortalSession contracts
    __tests__/billing.test.ts               # modified — cover new schema fields
    __tests__/checkout.test.ts              # NEW — contract shape for checkout/portal
    index.ts                                # modified — export new symbols

packages/db/
  src/schema/
    billing.ts                              # modified — rename stripe_* → provider_*, +billing_provider, +billingWebhookEvents table
    index.ts                                # modified — re-export billingWebhookEvents
  drizzle/
    0002_paddle_provider.sql                # NEW — ALTER TABLE rename + CREATE billing_webhook_events

apps/api/
  src/
    env.ts                                  # modified — +PADDLE_* and BILLING_ENABLED
    index.ts                                # modified — mount /api/billing/webhook/paddle
    worker.ts                               # NEW — merged fetch+scheduled entrypoint
    billing/
      entitlements.ts                       # modified — return graceUntil/billingEnabled/billingProvider
      paddle/
        client.ts                           # NEW — Paddle API wrappers (createTransaction/createPortalSession)
        signature.ts                        # NEW — HMAC-SHA256 Paddle-Signature verifier
        events.ts                           # NEW — Paddle event → internal BillingEvent normalizer
        apply.ts                            # NEW — applyBillingEvent(db, userId, event) writes user_entitlements
        __tests__/signature.test.ts         # NEW
        __tests__/events.test.ts            # NEW
        __tests__/apply.test.ts             # NEW
        __tests__/client.test.ts            # NEW — mocked fetch
      webhook-handler.ts                    # NEW — Hono handler: verify + idempotent insert + normalize + apply
      __tests__/webhook-handler.test.ts     # NEW
      checkout.ts                           # NEW — createCheckoutSession / createPortalSession impls
      __tests__/checkout.test.ts            # NEW
    orpc/
      billing.ts                            # modified — +createCheckoutSession/+createPortalSession
      __tests__/billing.test.ts             # modified — add two new procedures
    ai/
      proxy.ts                              # modified — pass upstream_model/input_tokens/output_tokens to chargeTokens
    billing/quota.ts                        # modified — chargeTokens() accepts model/tokens params
    scheduled/
      retention.ts                          # NEW — delete old usage_log + billing_webhook_events
      __tests__/retention.test.ts           # NEW
  wrangler.toml                             # modified — +[vars] PADDLE_ENV/BILLING_ENABLED; +[triggers] crons; main=worker.ts

apps/extension/
  src/
    types/entitlements.ts                   # modified — +graceUntil/+billingEnabled/+billingProvider (mirror contract)
    entrypoints/
      upgrade-success/
        index.html                          # NEW
        main.tsx                            # NEW — polls entitlements, shows status
    hooks/
      use-checkout.ts                       # NEW — wraps createCheckoutSession + opens tab
      __tests__/use-checkout.test.tsx       # NEW
      use-pro-expiry-effect.ts              # NEW — on tier==='pro'→'free', set providersConfig.getu-pro.enabled=false
      __tests__/use-pro-expiry-effect.test.tsx # NEW
    components/billing/
      upgrade-dialog.tsx                    # modified — add Checkout button + plan toggle
      __tests__/upgrade-dialog.test.tsx     # modified — cover button click + billingEnabled gate
    wxt.config.ts                           # modified — register upgrade-success entrypoint (if needed)

apps/web/
  app/
    price/page.tsx                          # modified — add client Upgrade button
    upgrade/
      success/page.tsx                      # NEW — polls entitlements
  lib/
    orpc-client.ts                          # NEW (if not exists) — shared client factory for web

docs/
  contracts/billing.md                      # modified — v2 rewrite (Paddle semantics + provider abstraction)
```

---

## Task Overview

| # | Title | Scope | Est | Branch |
|---|---|---|---|---|
| T0 | Contract v2: entitlements fields + checkout/portal contracts + billing.md rewrite | `@getu/contract` + docs | 0.5d | `phase4/t0-contract-v2` |
| T1 | DB migration: provider rename + billing_webhook_events | `@getu/db` | 0.5d | `phase4/t1-db-migration` |
| T2 | Paddle API client + signature + env/secrets | `apps/api` | 1d | `phase4/t2-paddle-client` |
| T3 | `billing.createCheckoutSession` + `createPortalSession` | `apps/api` | 1d | `phase4/t3-checkout-rpc` |
| T4 | Webhook endpoint + event normalizer + apply | `apps/api` | 1.5d | `phase4/t4-webhook` |
| T5 | Extension: upgrade-success + UpgradeDialog Checkout + expiry effect | `apps/extension` | 1d | `phase4/t5-extension-ui` |
| T6 | Web: `/price` Upgrade + `/upgrade/success` | `apps/web` | 0.5d | `phase4/t6-web-ui` |
| T7 | Cron retention + usage_log token field population | `apps/api` | 0.5d | `phase4/t7-retention` |

**Critical path:** T0 → T1 → T2 → (T3 ∥ T4) → (T5 ∥ T6) → T7
**Total ≈ 6.5 working days.**

---

## Task 0: Contract v2 + billing.md rewrite

**Files:**
- Modify: `packages/contract/src/billing.ts`
- Modify: `packages/contract/src/index.ts`
- Modify: `packages/contract/src/__tests__/billing.test.ts`
- Create: `packages/contract/src/__tests__/checkout.test.ts`
- Modify: `docs/contracts/billing.md` (full rewrite → v2)

**Rationale:** Every downstream task imports the v2 schema + new procedures. Ship this first so everyone builds against stable types.

- [ ] **Step 1: Failing test for new `Entitlements` fields** (`packages/contract/src/__tests__/billing.test.ts`, add cases)

```ts
import { EntitlementsSchema, FREE_ENTITLEMENTS } from "../billing"

describe("EntitlementsSchema v2", () => {
  it("parses graceUntil / billingEnabled / billingProvider", () => {
    const parsed = EntitlementsSchema.parse({
      tier: "pro",
      features: [],
      quota: {},
      expiresAt: "2026-05-22T00:00:00.000Z",
      graceUntil: null,
      billingEnabled: true,
      billingProvider: "paddle",
    })
    expect(parsed.billingProvider).toBe("paddle")
    expect(parsed.graceUntil).toBeNull()
  })

  it("FREE_ENTITLEMENTS has the new fields with sensible defaults", () => {
    expect(FREE_ENTITLEMENTS.graceUntil).toBeNull()
    expect(FREE_ENTITLEMENTS.billingEnabled).toBe(false)
    expect(FREE_ENTITLEMENTS.billingProvider).toBeNull()
  })
})
```

- [ ] **Step 2: Failing test for checkout/portal contracts** (`packages/contract/src/__tests__/checkout.test.ts`)

```ts
import { describe, expect, it } from "vitest"
import { createCheckoutSessionInputSchema, createCheckoutSessionOutputSchema } from "../billing"

describe("createCheckoutSession contract", () => {
  it("accepts valid plan + urls", () => {
    const input = createCheckoutSessionInputSchema.parse({
      plan: "pro_monthly",
      successUrl: "https://getutranslate.com/upgrade/success",
      cancelUrl: "https://getutranslate.com/price",
    })
    expect(input.plan).toBe("pro_monthly")
  })

  it("rejects non-https successUrl (except chrome-extension://)", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_yearly",
        successUrl: "http://evil.com/",
        cancelUrl: "https://getutranslate.com/price",
      }),
    ).toThrow()
  })

  it("accepts chrome-extension:// urls", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_monthly",
        successUrl: "chrome-extension://abc/upgrade-success.html",
        cancelUrl: "chrome-extension://abc/upgrade-success.html?cancelled=1",
      }),
    ).not.toThrow()
  })

  it("output carries a url", () => {
    const out = createCheckoutSessionOutputSchema.parse({ url: "https://pay.paddle.io/hsc_x" })
    expect(out.url).toMatch(/^https:/)
  })
})
```

- [ ] **Step 3: Run tests → FAIL**

```bash
pnpm --filter @getu/contract test
```
Expected: both files fail (symbols undefined).

- [ ] **Step 4: Implement schema extensions in `packages/contract/src/billing.ts`**

Add to `EntitlementsSchema`:
```ts
export const EntitlementsSchema = z.object({
  tier: z.enum(["free", "pro", "enterprise"]),
  features: z.array(FeatureKey),
  quota: z.record(z.string(), QuotaBucketSchema),
  expiresAt: z.string().datetime().nullable(),
  graceUntil: z.string().datetime().nullable(),
  billingEnabled: z.boolean(),
  billingProvider: z.enum(["paddle", "stripe"]).nullable(),
})
```

Update `FREE_ENTITLEMENTS`:
```ts
export const FREE_ENTITLEMENTS: Entitlements = {
  tier: "free",
  features: [],
  quota: {},
  expiresAt: null,
  graceUntil: null,
  billingEnabled: false,
  billingProvider: null,
}
```

Add checkout/portal schemas + extend `billingContract`:
```ts
const urlSchema = z.string().refine(
  (s) => s.startsWith("https://getutranslate.com/")
      || s.startsWith("https://www.getutranslate.com/")
      || s.startsWith("chrome-extension://"),
  { message: "url must be getutranslate.com or chrome-extension://" },
)

export const createCheckoutSessionInputSchema = z.object({
  plan: z.enum(["pro_monthly", "pro_yearly"]),
  successUrl: urlSchema,
  cancelUrl: urlSchema,
}).strict()
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionInputSchema>

export const createCheckoutSessionOutputSchema = z.object({
  url: z.string().url(),
})
export type CreateCheckoutSessionOutput = z.infer<typeof createCheckoutSessionOutputSchema>

export const createPortalSessionOutputSchema = z.object({
  url: z.string().url(),
})

export const billingContract = oc.router({
  getEntitlements: oc.input(z.object({}).strict()).output(EntitlementsSchema),
  consumeQuota: oc.input(consumeQuotaInputSchema).output(consumeQuotaOutputSchema),
  createCheckoutSession: oc.input(createCheckoutSessionInputSchema).output(createCheckoutSessionOutputSchema),
  createPortalSession: oc.input(z.object({}).strict()).output(createPortalSessionOutputSchema),
})
```

Update `packages/contract/src/index.ts` re-exports.

- [ ] **Step 5: Run tests → PASS**
```bash
pnpm --filter @getu/contract test
```

- [ ] **Step 6: Rewrite `docs/contracts/billing.md` to v2**
- Replace Stripe-specific sections with Paddle + provider-agnostic framing.
- Add v2 changelog entry.
- §3.1 `Entitlements` has new fields with description.
- §4.3 `createCheckoutSession` response shape, 412 for `BILLING_ENABLED=false`.
- §4.4 `createPortalSession`.
- §5 Paddle webhook event table (copy from design §3 above).

- [ ] **Step 7: Commit**
```bash
git add packages/contract/src/billing.ts packages/contract/src/index.ts \
        packages/contract/src/__tests__/billing.test.ts \
        packages/contract/src/__tests__/checkout.test.ts \
        docs/contracts/billing.md
git commit -m "feat(contract): v2 schema + checkout/portal procedures + Paddle rewrite of billing.md"
```

- [ ] **Step 8: Open PR, request `code-reviewer` review (sonnet)**

---

## Task 1: DB migration — rename + `billing_webhook_events`

**Files:**
- Modify: `packages/db/src/schema/billing.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/drizzle/0002_paddle_provider.sql`
- Modify: `apps/api/src/billing/entitlements.ts` (consume renamed columns)
- Modify: `apps/api/scripts/grant-pro.ts` (rename references)

**Rationale:** Separate PR so rename + new table land atomically without entangling Paddle code.

- [ ] **Step 1: Failing schema test** (`packages/db/src/schema/__tests__/billing.test.ts` if exists else create)

```ts
import { describe, expect, it } from "vitest"
import { userEntitlements, billingWebhookEvents } from "../billing"

describe("billing schema v2", () => {
  it("userEntitlements exposes provider_* columns", () => {
    const cols = Object.keys(userEntitlements as any)
    expect(cols).toContain("providerCustomerId")
    expect(cols).toContain("providerSubscriptionId")
    expect(cols).toContain("billingProvider")
    expect(cols).not.toContain("stripeCustomerId")
  })

  it("billingWebhookEvents table is defined", () => {
    expect(billingWebhookEvents).toBeDefined()
  })
})
```

- [ ] **Step 2: Update `packages/db/src/schema/billing.ts`**

```ts
export const userEntitlements = sqliteTable("user_entitlements", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["free", "pro", "enterprise"] }).notNull().default("free"),
  features: text("features").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  billingProvider: text("billing_provider", { enum: ["paddle", "stripe"] }),
  graceUntil: integer("grace_until", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})

export const billingWebhookEvents = sqliteTable("billing_webhook_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider", { enum: ["paddle", "stripe"] }).notNull(),
  eventType: text("event_type").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  status: text("status", { enum: ["received", "processed", "error"] }).notNull().default("received"),
  errorMessage: text("error_message"),
  payloadJson: text("payload_json").notNull(),
})
```

Re-export from `packages/db/src/schema/index.ts`.

- [ ] **Step 3: Write SQL migration** `packages/db/drizzle/0002_paddle_provider.sql`

```sql
-- Rename legacy columns (SQLite supports ALTER RENAME COLUMN since 3.25; D1 supports it)
ALTER TABLE user_entitlements RENAME COLUMN stripe_customer_id TO provider_customer_id;
ALTER TABLE user_entitlements RENAME COLUMN stripe_subscription_id TO provider_subscription_id;
ALTER TABLE user_entitlements ADD COLUMN billing_provider TEXT;

CREATE TABLE billing_webhook_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)),
  processed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  payload_json TEXT NOT NULL
);

CREATE INDEX billing_webhook_events_received_at_idx ON billing_webhook_events (received_at);
```

Also append a `meta/_journal.json` entry (drizzle convention — subagent checks existing journal format to match).

- [ ] **Step 4: Update `apps/api/src/billing/entitlements.ts`**

Extend returned object to include `graceUntil`, `billingEnabled` (read from env), `billingProvider`:

```ts
export async function loadEntitlements(
  db: Db,
  userId: string,
  billingEnabled: boolean,
): Promise<Entitlements> {
  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  if (!row) return { ...FREE_ENTITLEMENTS, billingEnabled }

  const expiresAtMs = row.expiresAt instanceof Date ? row.expiresAt.getTime() : (row.expiresAt as number | null)
  const graceAtMs = row.graceUntil instanceof Date ? row.graceUntil.getTime() : (row.graceUntil as number | null)
  const expired = expiresAtMs != null && expiresAtMs < Date.now()
  if (row.tier === "free" || expired) return { ...FREE_ENTITLEMENTS, billingEnabled }

  return {
    tier: row.tier,
    features: parseFeatures(row.features),
    quota: {},
    expiresAt: expiresAtMs != null ? new Date(expiresAtMs).toISOString() : null,
    graceUntil: graceAtMs != null ? new Date(graceAtMs).toISOString() : null,
    billingEnabled,
    billingProvider: row.billingProvider ?? null,
  }
}
```

Update caller at `apps/api/src/orpc/billing.ts`:
```ts
getEntitlements: authed.handler(async ({ context }) => {
  const db = createDb(context.env.DB)
  const enabled = context.env.BILLING_ENABLED === "true"
  return loadEntitlements(db, context.session.user.id, enabled)
}),
```

Update `apps/api/scripts/grant-pro.ts` to include `billing_provider='paddle'` when granting (or `null` — leave `null` since admin grant isn't real Paddle sub).

- [ ] **Step 5: Apply migration locally + tests**
```bash
HTTP_PROXY="" HTTPS_PROXY="" pnpm --filter @getu/api exec wrangler d1 migrations apply getu-translate --local
pnpm --filter @getu/db test
pnpm --filter @getu/api test
```

- [ ] **Step 6: Apply migration to production D1**
```bash
HTTP_PROXY="" HTTPS_PROXY="" NO_PROXY="*.cloudflare.com,*.pages.dev,*.workers.dev" \
  pnpm --filter @getu/api exec wrangler d1 migrations apply getu-translate --remote
```

- [ ] **Step 7: Commit + PR**
```bash
git commit -m "feat(db): rename stripe_* → provider_*; add billing_webhook_events; extend entitlements"
```

---

## Task 2: Paddle API client + signature + env/secrets

**Files:**
- Modify: `apps/api/src/env.ts`
- Create: `apps/api/src/billing/paddle/client.ts`
- Create: `apps/api/src/billing/paddle/signature.ts`
- Create: `apps/api/src/billing/paddle/__tests__/signature.test.ts`
- Create: `apps/api/src/billing/paddle/__tests__/client.test.ts`
- Modify: `apps/api/wrangler.toml`
- Create/modify: `apps/api/.dev.vars` (gitignored) — sandbox values

**Rationale:** Shared Paddle primitives that T3 (checkout RPC) and T4 (webhook) both depend on. Ship + test in isolation with fake fetch.

- [ ] **Step 1: Failing test — signature.test.ts**

```ts
import { describe, expect, it } from "vitest"
import { verifyPaddleSignature } from "../signature"

describe("verifyPaddleSignature", () => {
  const secret = "pdl_ntfset_01abcd"
  const body = '{"event_id":"evt_01","event_type":"subscription.activated"}'

  it("accepts a valid signature within the window", async () => {
    const ts = 1700000000
    const h1 = "compute the hmac here"  // filled by running crypto in REPL before writing test
    const header = `ts=${ts};h1=${h1}`
    await expect(verifyPaddleSignature({ header, rawBody: body, secret, now: () => ts * 1000 })).resolves.toBe(true)
  })

  it("rejects stale timestamps (>5min)", async () => {
    const ts = 1700000000
    const header = `ts=${ts};h1=abc`
    await expect(verifyPaddleSignature({ header, rawBody: body, secret, now: () => (ts + 400) * 1000 })).resolves.toBe(false)
  })

  it("rejects invalid h1", async () => {
    const ts = Math.floor(Date.now() / 1000)
    const header = `ts=${ts};h1=deadbeef`
    await expect(verifyPaddleSignature({ header, rawBody: body, secret })).resolves.toBe(false)
  })

  it("rejects malformed header", async () => {
    await expect(verifyPaddleSignature({ header: "garbage", rawBody: body, secret })).resolves.toBe(false)
  })
})
```

Subagent note: compute the expected HMAC in test setup via `crypto.subtle` helper or pre-compute once — do not hardcode a magic string.

- [ ] **Step 2: Implement `signature.ts`**

```ts
interface VerifyInput {
  header: string | null
  rawBody: string
  secret: string
  now?: () => number  // ms
  toleranceMs?: number
}

export async function verifyPaddleSignature({ header, rawBody, secret, now = Date.now, toleranceMs = 5 * 60_000 }: VerifyInput): Promise<boolean> {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(";").map(p => p.split("=")).filter(a => a.length === 2),
  ) as Record<string, string>
  if (!parts.ts || !parts.h1) return false
  const ts = Number.parseInt(parts.ts, 10)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(now() - ts * 1000) > toleranceMs) return false
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.ts}:${rawBody}`))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
  return timingSafeEqual(hex, parts.h1)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let res = 0
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return res === 0
}
```

- [ ] **Step 3: Failing test — client.test.ts**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPaddleClient } from "../client"

describe("paddle client.createTransaction", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("POSTs to /transactions with correct body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "txn_01", checkout: { url: "https://pay.paddle.io/hsc_01" } } }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = createPaddleClient({ apiKey: "pdl_k_01", baseUrl: "https://sandbox-api.paddle.com" })
    const out = await client.createTransaction({
      priceId: "pri_01",
      email: "u@x.com",
      userId: "user_01",
      successUrl: "https://getutranslate.com/upgrade/success",
    })
    expect(out.checkoutUrl).toBe("https://pay.paddle.io/hsc_01")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-api.paddle.com/transactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer pdl_k_01" }),
      }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.custom_data).toEqual({ user_id: "user_01" })
    expect(body.items[0].price_id).toBe("pri_01")
  })

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{"error":{"detail":"bad"}}' }))
    const client = createPaddleClient({ apiKey: "k", baseUrl: "https://x" })
    await expect(client.createTransaction({ priceId: "p", email: "e", userId: "u", successUrl: "https://getutranslate.com/" })).rejects.toThrow(/paddle/i)
  })
})

describe("paddle client.createPortalSession", () => {
  it("POSTs to /customers/{id}/portal-sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { urls: { general: { overview: "https://customer-portal.paddle.com/x" } } } }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = createPaddleClient({ apiKey: "k", baseUrl: "https://sandbox-api.paddle.com" })
    const out = await client.createPortalSession({ customerId: "ctm_01", subscriptionIds: ["sub_01"] })
    expect(out.url).toBe("https://customer-portal.paddle.com/x")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-api.paddle.com/customers/ctm_01/portal-sessions",
      expect.objectContaining({ method: "POST" }),
    )
  })
})
```

- [ ] **Step 4: Implement `client.ts`**

```ts
export interface PaddleClientOpts { apiKey: string; baseUrl: string }

export interface CreateTransactionIn {
  priceId: string
  email: string
  userId: string
  successUrl: string
}
export interface CreateTransactionOut { transactionId: string; checkoutUrl: string }

export interface CreatePortalSessionIn { customerId: string; subscriptionIds?: string[] }
export interface CreatePortalSessionOut { url: string }

export function createPaddleClient({ apiKey, baseUrl }: PaddleClientOpts) {
  async function call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Paddle API ${res.status}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  return {
    async createTransaction(input: CreateTransactionIn): Promise<CreateTransactionOut> {
      const resp = await call<{ data: { id: string; checkout: { url: string } } }>("/transactions", {
        items: [{ price_id: input.priceId, quantity: 1 }],
        customer: { email: input.email },
        custom_data: { user_id: input.userId },
        checkout: { url: input.successUrl },
        collection_mode: "automatic",
      })
      return { transactionId: resp.data.id, checkoutUrl: resp.data.checkout.url }
    },

    async createPortalSession(input: CreatePortalSessionIn): Promise<CreatePortalSessionOut> {
      const resp = await call<{ data: { urls: { general: { overview: string } } } }>(
        `/customers/${input.customerId}/portal-sessions`,
        input.subscriptionIds ? { subscription_ids: input.subscriptionIds } : {},
      )
      return { url: resp.data.urls.general.overview }
    },
  }
}

export type PaddleClient = ReturnType<typeof createPaddleClient>
```

- [ ] **Step 5: Update `env.ts`**

```ts
export interface WorkerEnv {
  // ...existing...
  PADDLE_API_KEY: string
  PADDLE_WEBHOOK_SECRET: string
  PADDLE_PRICE_PRO_MONTHLY: string
  PADDLE_PRICE_PRO_YEARLY: string
  PADDLE_BASE_URL: string     // e.g. https://sandbox-api.paddle.com or https://api.paddle.com
  BILLING_ENABLED: string     // "true" | "false"
}
// extend SecretsSchema + parseSecrets similarly
```

- [ ] **Step 6: Update `wrangler.toml`**

```toml
[vars]
# ...existing...
PADDLE_BASE_URL = "https://sandbox-api.paddle.com"
BILLING_ENABLED = "false"

[env.production.vars]
# ...existing...
PADDLE_BASE_URL = "https://sandbox-api.paddle.com"   # stays sandbox until vendor approval
BILLING_ENABLED = "false"
```

- [ ] **Step 7: Set secrets (dev + production sandbox)**
```bash
# .dev.vars (gitignored)
cat >> apps/api/.dev.vars <<'EOF'
PADDLE_API_KEY=<sandbox key>
PADDLE_WEBHOOK_SECRET=<sandbox notification secret>
PADDLE_PRICE_PRO_MONTHLY=pri_01_sandbox_monthly
PADDLE_PRICE_PRO_YEARLY=pri_01_sandbox_yearly
EOF

# production (sandbox values for now)
for k in PADDLE_API_KEY PADDLE_WEBHOOK_SECRET PADDLE_PRICE_PRO_MONTHLY PADDLE_PRICE_PRO_YEARLY; do
  HTTP_PROXY="" HTTPS_PROXY="" NO_PROXY="*.cloudflare.com,*.pages.dev,*.workers.dev" \
    pnpm --filter @getu/api exec wrangler secret put "$k" --env production
done
```

- [ ] **Step 8: Run tests → PASS**
```bash
pnpm --filter @getu/api test
```

- [ ] **Step 9: Commit + PR**
```bash
git commit -m "feat(api): add Paddle API client + signature verifier + env config"
```

---

## Task 3: `billing.createCheckoutSession` + `createPortalSession`

**Files:**
- Create: `apps/api/src/billing/checkout.ts`
- Create: `apps/api/src/billing/__tests__/checkout.test.ts`
- Modify: `apps/api/src/orpc/billing.ts`
- Modify: `apps/api/src/orpc/__tests__/billing.test.ts`

- [ ] **Step 1: Failing tests** — `checkout.test.ts`

```ts
import { describe, expect, it, vi } from "vitest"
import { createCheckoutSession, createPortalSession } from "../checkout"

function fakeDb(row?: any) {
  return {
    select: () => ({ from: () => ({ where: () => ({ get: async () => row }) }) }),
  } as any
}
function fakePaddle(overrides?: any) {
  return {
    createTransaction: vi.fn().mockResolvedValue({ transactionId: "txn_01", checkoutUrl: "https://pay.paddle.io/hsc_01" }),
    createPortalSession: vi.fn().mockResolvedValue({ url: "https://customer-portal.paddle.com/x" }),
    ...overrides,
  }
}

describe("createCheckoutSession", () => {
  const env = {
    BILLING_ENABLED: "true",
    PADDLE_PRICE_PRO_MONTHLY: "pri_m",
    PADDLE_PRICE_PRO_YEARLY: "pri_y",
  } as any

  it("returns Paddle checkout url for fresh user", async () => {
    const out = await createCheckoutSession({
      db: fakeDb(null),
      paddle: fakePaddle(),
      env,
      userId: "u1",
      userEmail: "u@x.com",
      input: { plan: "pro_monthly", successUrl: "https://getutranslate.com/ok", cancelUrl: "https://getutranslate.com/x" },
    })
    expect(out.url).toBe("https://pay.paddle.io/hsc_01")
  })

  it("412 when BILLING_ENABLED=false", async () => {
    await expect(createCheckoutSession({
      db: fakeDb(null),
      paddle: fakePaddle(),
      env: { ...env, BILLING_ENABLED: "false" },
      userId: "u1",
      userEmail: "u@x.com",
      input: { plan: "pro_monthly", successUrl: "https://getutranslate.com/", cancelUrl: "https://getutranslate.com/" },
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("412 when user already has active Paddle subscription", async () => {
    const row = { tier: "pro", billingProvider: "paddle", providerSubscriptionId: "sub_01", expiresAt: new Date(Date.now() + 86400_000) }
    await expect(createCheckoutSession({
      db: fakeDb(row),
      paddle: fakePaddle(),
      env,
      userId: "u1",
      userEmail: "u@x.com",
      input: { plan: "pro_monthly", successUrl: "https://getutranslate.com/", cancelUrl: "https://getutranslate.com/" },
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })
})

describe("createPortalSession", () => {
  it("returns portal url for user with active sub", async () => {
    const row = { providerCustomerId: "ctm_01", providerSubscriptionId: "sub_01", billingProvider: "paddle" }
    const out = await createPortalSession({
      db: fakeDb(row),
      paddle: fakePaddle(),
      env: { BILLING_ENABLED: "true" } as any,
      userId: "u1",
    })
    expect(out.url).toBe("https://customer-portal.paddle.com/x")
  })

  it("412 when user has no customer id", async () => {
    await expect(createPortalSession({
      db: fakeDb(null),
      paddle: fakePaddle(),
      env: { BILLING_ENABLED: "true" } as any,
      userId: "u1",
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })
})
```

- [ ] **Step 2: Implement `checkout.ts`**

```ts
import { ORPCError } from "@orpc/server"
import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { CreateCheckoutSessionInput } from "@getu/contract"
import type { PaddleClient } from "./paddle/client"
import type { WorkerEnv } from "../env"

const { userEntitlements } = schema

interface CheckoutDeps {
  db: Db
  paddle: PaddleClient
  env: WorkerEnv
  userId: string
  userEmail: string
  input: CreateCheckoutSessionInput
}

export async function createCheckoutSession(deps: CheckoutDeps): Promise<{ url: string }> {
  const { db, paddle, env, userId, userEmail, input } = deps
  if (env.BILLING_ENABLED !== "true") {
    throw new ORPCError("PRECONDITION_FAILED", { message: "Billing is not enabled" })
  }
  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  const expiresAtMs = row?.expiresAt instanceof Date ? row.expiresAt.getTime() : (row?.expiresAt as number | null)
  if (row?.tier === "pro" && row.providerSubscriptionId && (expiresAtMs == null || expiresAtMs > Date.now())) {
    throw new ORPCError("PRECONDITION_FAILED", { message: "User already has an active Pro subscription" })
  }
  const priceId = input.plan === "pro_monthly" ? env.PADDLE_PRICE_PRO_MONTHLY : env.PADDLE_PRICE_PRO_YEARLY
  const { checkoutUrl } = await paddle.createTransaction({
    priceId, email: userEmail, userId, successUrl: input.successUrl,
  })
  return { url: checkoutUrl }
}

interface PortalDeps {
  db: Db
  paddle: PaddleClient
  env: WorkerEnv
  userId: string
}

export async function createPortalSession(deps: PortalDeps): Promise<{ url: string }> {
  const { db, paddle, userId } = deps
  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  if (!row?.providerCustomerId) {
    throw new ORPCError("PRECONDITION_FAILED", { message: "No billing customer on file" })
  }
  return paddle.createPortalSession({
    customerId: row.providerCustomerId,
    subscriptionIds: row.providerSubscriptionId ? [row.providerSubscriptionId] : undefined,
  })
}
```

- [ ] **Step 3: Wire oRPC procedures in `apps/api/src/orpc/billing.ts`**

```ts
import {
  consumeQuotaInputSchema, consumeQuotaOutputSchema,
  createCheckoutSessionInputSchema, createCheckoutSessionOutputSchema,
  createPortalSessionOutputSchema,
} from "@getu/contract"
import { createPaddleClient } from "../billing/paddle/client"
import { createCheckoutSession, createPortalSession } from "../billing/checkout"

// ...existing imports...

export const billingRouter = {
  getEntitlements: authed.handler(async ({ context }) => {
    const db = createDb(context.env.DB)
    return loadEntitlements(db, context.session.user.id, context.env.BILLING_ENABLED === "true")
  }),
  consumeQuota: authed
    .input(consumeQuotaInputSchema)
    .output(consumeQuotaOutputSchema)
    .handler(async ({ context, input }) => {
      const db = createDb(context.env.DB)
      return consumeQuotaImpl(db, context.session.user.id, input.bucket, input.amount, input.request_id)
    }),
  createCheckoutSession: authed
    .input(createCheckoutSessionInputSchema)
    .output(createCheckoutSessionOutputSchema)
    .handler(async ({ context, input }) => {
      const db = createDb(context.env.DB)
      const paddle = createPaddleClient({ apiKey: context.env.PADDLE_API_KEY, baseUrl: context.env.PADDLE_BASE_URL })
      return createCheckoutSession({
        db, paddle, env: context.env,
        userId: context.session.user.id, userEmail: context.session.user.email,
        input,
      })
    }),
  createPortalSession: authed
    .input(z.object({}).strict())
    .output(createPortalSessionOutputSchema)
    .handler(async ({ context }) => {
      const db = createDb(context.env.DB)
      const paddle = createPaddleClient({ apiKey: context.env.PADDLE_API_KEY, baseUrl: context.env.PADDLE_BASE_URL })
      return createPortalSession({ db, paddle, env: context.env, userId: context.session.user.id })
    }),
}
```

- [ ] **Step 4: Tests PASS**
```bash
pnpm --filter @getu/api test
```

- [ ] **Step 5: Commit + PR (request code-reviewer + general-purpose spec review)**
```bash
git commit -m "feat(api): billing.createCheckoutSession + createPortalSession with Paddle"
```

---

## Task 4: Paddle webhook endpoint + normalizer + apply

**Files:**
- Create: `apps/api/src/billing/paddle/events.ts` + test
- Create: `apps/api/src/billing/paddle/apply.ts` + test
- Create: `apps/api/src/billing/webhook-handler.ts` + test
- Modify: `apps/api/src/index.ts` — mount `POST /api/billing/webhook/paddle`

- [ ] **Step 1: Failing test — `events.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { normalizePaddleEvent } from "../events"

const base = {
  event_id: "evt_01",
  occurred_at: "2026-05-01T00:00:00.000Z",
  data: {
    id: "sub_01",
    customer_id: "ctm_01",
    status: "active",
    current_billing_period: { ends_at: "2026-06-01T00:00:00.000Z" },
    items: [{ price: { id: "pri_m" } }],
    custom_data: { user_id: "user_01" },
  },
}

describe("normalizePaddleEvent", () => {
  it("maps subscription.activated → subscription_activated", () => {
    const out = normalizePaddleEvent({ ...base, event_type: "subscription.activated" })
    expect(out).toEqual({
      kind: "subscription_activated",
      userId: "user_01",
      customerId: "ctm_01",
      subscriptionId: "sub_01",
      expiresAt: new Date("2026-06-01T00:00:00.000Z").getTime(),
      priceId: "pri_m",
    })
  })

  it("maps subscription.past_due → payment_past_due with 7d grace", () => {
    const out = normalizePaddleEvent({ ...base, event_type: "subscription.past_due" })
    expect(out.kind).toBe("payment_past_due")
    expect(out.graceUntil).toBe(new Date("2026-06-01T00:00:00.000Z").getTime() + 7 * 86400_000)
  })

  it("maps subscription.canceled → subscription_canceled", () => {
    const out = normalizePaddleEvent({ ...base, event_type: "subscription.canceled" })
    expect(out.kind).toBe("subscription_canceled")
  })

  it("maps transaction.completed → payment_succeeded", () => {
    const out = normalizePaddleEvent({ ...base, event_type: "transaction.completed" })
    expect(out.kind).toBe("payment_succeeded")
  })

  it("returns ignored for unknown events", () => {
    const out = normalizePaddleEvent({ ...base, event_type: "adjustment.created" })
    expect(out.kind).toBe("ignored")
  })

  it("returns ignored when custom_data.user_id missing", () => {
    const ev: any = { ...base, event_type: "subscription.activated", data: { ...base.data, custom_data: {} } }
    const out = normalizePaddleEvent(ev)
    expect(out.kind).toBe("ignored")
  })
})
```

- [ ] **Step 2: Implement `events.ts`**

```ts
export type BillingEvent =
  | { kind: "subscription_activated"; userId: string; customerId: string; subscriptionId: string; expiresAt: number; priceId: string }
  | { kind: "subscription_updated"; userId: string; subscriptionId: string; expiresAt: number; priceId: string }
  | { kind: "subscription_canceled"; userId: string; subscriptionId: string }
  | { kind: "payment_past_due"; userId: string; subscriptionId: string; graceUntil: number }
  | { kind: "payment_succeeded"; userId: string; subscriptionId: string }
  | { kind: "ignored"; reason: string }

export function normalizePaddleEvent(evt: any): BillingEvent {
  const t = evt?.event_type as string | undefined
  const data = evt?.data ?? {}
  const userId = data?.custom_data?.user_id as string | undefined
  if (!t) return { kind: "ignored", reason: "no event_type" }
  if (!userId && !t.startsWith("adjustment.") && t !== "address.created") {
    return { kind: "ignored", reason: "missing custom_data.user_id" }
  }
  const subEnds = data?.current_billing_period?.ends_at
  const expiresAt = subEnds ? new Date(subEnds).getTime() : 0
  const priceId = data?.items?.[0]?.price?.id ?? ""
  switch (t) {
    case "subscription.activated":
    case "subscription.created":
      return { kind: "subscription_activated", userId: userId!, customerId: data.customer_id, subscriptionId: data.id, expiresAt, priceId }
    case "subscription.updated":
      return { kind: "subscription_updated", userId: userId!, subscriptionId: data.id, expiresAt, priceId }
    case "subscription.canceled":
      return { kind: "subscription_canceled", userId: userId!, subscriptionId: data.id }
    case "subscription.past_due":
    case "subscription.paused":
      return { kind: "payment_past_due", userId: userId!, subscriptionId: data.id, graceUntil: expiresAt + 7 * 86400_000 }
    case "transaction.completed":
      return { kind: "payment_succeeded", userId: userId!, subscriptionId: data.subscription_id ?? data.id }
    default:
      return { kind: "ignored", reason: `unhandled event_type ${t}` }
  }
}
```

- [ ] **Step 3: Failing test — `apply.test.ts`**

Use `better-sqlite3` in-memory DB per Phase 3 precedent (`apps/api/src/__tests__/utils/test-db.ts`).

```ts
import { describe, expect, it, beforeEach } from "vitest"
import { applyBillingEvent } from "../apply"
import { makeTestDb } from "../../../__tests__/utils/test-db"

describe("applyBillingEvent", () => {
  let db: any
  beforeEach(async () => { db = await makeTestDb() })

  it("subscription_activated writes tier=pro with features", async () => {
    await applyBillingEvent(db, {
      kind: "subscription_activated",
      userId: "u1", customerId: "ctm_01", subscriptionId: "sub_01",
      expiresAt: Date.now() + 30 * 86400_000, priceId: "pri_m",
    })
    const row = await db.select().from(schema.userEntitlements).where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row.tier).toBe("pro")
    expect(JSON.parse(row.features)).toContain("ai_translate_pool")
    expect(row.billingProvider).toBe("paddle")
  })

  it("subscription_canceled flips tier=free + clears subscription_id but keeps customer_id", async () => {
    // ... seed pro, apply canceled, assert
  })

  it("payment_past_due sets grace_until but keeps tier=pro", async () => {
    // ...
  })

  it("payment_succeeded clears grace_until", async () => {
    // ...
  })

  it("is idempotent within apply (same event applied twice produces same state)", async () => {
    // ...
  })
})
```

- [ ] **Step 4: Implement `apply.ts`**

```ts
import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { BillingEvent } from "./events"

// Keep in sync with FeatureKey enum in packages/contract/src/billing.ts
// PDF PR#C (f38e702) added pdf_translate_unlimited + pdf_translate_export.
const PRO_FEATURES = [
  "pdf_translate", "pdf_translate_unlimited", "pdf_translate_export",
  "input_translate_unlimited", "vocab_unlimited", "vocab_cloud_sync",
  "ai_translate_pool", "subtitle_platforms_extended",
]

export async function applyBillingEvent(db: Db, evt: BillingEvent): Promise<void> {
  if (evt.kind === "ignored") return
  const now = new Date()
  const table = schema.userEntitlements
  const existing = await db.select().from(table).where(eq(table.userId, evt.userId)).get()

  const base = existing ?? {
    userId: evt.userId, tier: "free" as const, features: "[]",
    createdAt: now, updatedAt: now,
  }

  switch (evt.kind) {
    case "subscription_activated": {
      const patch = {
        ...base, tier: "pro" as const,
        features: JSON.stringify(PRO_FEATURES),
        expiresAt: new Date(evt.expiresAt),
        providerCustomerId: evt.customerId,
        providerSubscriptionId: evt.subscriptionId,
        billingProvider: "paddle" as const,
        graceUntil: null,
        updatedAt: now,
      }
      if (existing) await db.update(table).set(patch).where(eq(table.userId, evt.userId))
      else await db.insert(table).values(patch)
      break
    }
    case "subscription_updated": {
      if (!existing) return
      await db.update(table).set({
        expiresAt: new Date(evt.expiresAt), updatedAt: now,
      }).where(eq(table.userId, evt.userId))
      break
    }
    case "subscription_canceled": {
      if (!existing) return
      await db.update(table).set({
        tier: "free", features: "[]",
        expiresAt: now, providerSubscriptionId: null,
        graceUntil: null, updatedAt: now,
      }).where(eq(table.userId, evt.userId))
      break
    }
    case "payment_past_due": {
      if (!existing) return
      await db.update(table).set({
        graceUntil: new Date(evt.graceUntil), updatedAt: now,
      }).where(eq(table.userId, evt.userId))
      break
    }
    case "payment_succeeded": {
      if (!existing) return
      await db.update(table).set({ graceUntil: null, updatedAt: now }).where(eq(table.userId, evt.userId))
      break
    }
  }
}
```

- [ ] **Step 5: Implement `webhook-handler.ts`**

```ts
import type { Context } from "hono"
import { eq } from "drizzle-orm"
import { createDb, schema } from "@getu/db"
import { verifyPaddleSignature } from "./paddle/signature"
import { normalizePaddleEvent } from "./paddle/events"
import { applyBillingEvent } from "./paddle/apply"
import type { WorkerEnv } from "../env"

export async function handlePaddleWebhook(c: Context<{ Bindings: WorkerEnv }>) {
  const raw = await c.req.raw.clone().text()
  const header = c.req.header("Paddle-Signature") ?? null
  const ok = await verifyPaddleSignature({ header, rawBody: raw, secret: c.env.PADDLE_WEBHOOK_SECRET })
  if (!ok) return c.json({ error: "invalid_signature" }, 400)

  let evt: any
  try { evt = JSON.parse(raw) } catch { return c.json({ error: "bad_json" }, 400) }
  const eventId = evt?.event_id
  if (!eventId) return c.json({ error: "missing_event_id" }, 400)

  const db = createDb(c.env.DB)

  // Idempotency: INSERT OR IGNORE
  try {
    await db.insert(schema.billingWebhookEvents).values({
      eventId, provider: "paddle", eventType: evt.event_type ?? "unknown",
      payloadJson: raw, status: "received",
    }).onConflictDoNothing()
  } catch (err) {
    console.error("[paddle-webhook] insert event failed", err)
  }

  const existing = await db.select().from(schema.billingWebhookEvents).where(eq(schema.billingWebhookEvents.eventId, eventId)).get()
  if (existing?.status === "processed") return c.json({ ok: true, duplicate: true })

  try {
    const normalized = normalizePaddleEvent(evt)
    await applyBillingEvent(db, normalized)
    await db.update(schema.billingWebhookEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(schema.billingWebhookEvents.eventId, eventId))
    return c.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.update(schema.billingWebhookEvents)
      .set({ status: "error", errorMessage: msg.slice(0, 500) })
      .where(eq(schema.billingWebhookEvents.eventId, eventId))
    console.error("[paddle-webhook] apply failed", err)
    return c.json({ error: "apply_failed" }, 500)  // Paddle retries
  }
}
```

- [ ] **Step 6: Mount route in `apps/api/src/index.ts`**

```ts
import { handlePaddleWebhook } from "./billing/webhook-handler"

// ...after existing app.post("/ai/v1/...")
app.post("/api/billing/webhook/paddle", handlePaddleWebhook)
```

No CORS middleware on webhook (Paddle servers don't use CORS). No auth middleware (signature is the auth).

- [ ] **Step 7: Integration test with full payload round-trip**

Test at `apps/api/src/billing/__tests__/webhook-handler.test.ts` with a fixture Paddle event payload + computed signature via test helper.

- [ ] **Step 8: Run tests → PASS**
```bash
pnpm --filter @getu/api test
```

- [ ] **Step 9: Commit + PR**
```bash
git commit -m "feat(api): Paddle webhook endpoint with signature + idempotency + event normalizer"
```

---

## Task 5: Extension — upgrade-success entrypoint + UpgradeDialog Checkout + expiry effect

**Files:**
- Create: `apps/extension/src/entrypoints/upgrade-success/index.html`
- Create: `apps/extension/src/entrypoints/upgrade-success/main.tsx`
- Create: `apps/extension/src/hooks/use-checkout.ts` + test
- Create: `apps/extension/src/hooks/use-pro-expiry-effect.ts` + test
- Modify: `apps/extension/src/components/billing/upgrade-dialog.tsx` + test
- Modify: `apps/extension/src/types/entitlements.ts` — add new fields

- [ ] **Step 1: Update `types/entitlements.ts` to mirror contract v2** — add `graceUntil`, `billingEnabled`, `billingProvider`. Update `FREE_ENTITLEMENTS` and tests accordingly. Run existing test suite → expect failures where tests check exact shape, fix them.

- [ ] **Step 2: Write failing test for `useCheckout` hook**

```ts
// apps/extension/src/hooks/__tests__/use-checkout.test.tsx
import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useCheckout } from "../use-checkout"

vi.mock("@/utils/orpc/client", () => ({
  orpcClient: {
    billing: {
      createCheckoutSession: vi.fn().mockResolvedValue({ url: "https://pay.paddle.io/hsc_x" }),
    },
  },
}))
vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    runtime: { getURL: (p: string) => `chrome-extension://fakeid/${p}` },
  },
}))

describe("useCheckout", () => {
  it("calls oRPC + opens tab", async () => {
    const { result } = renderHook(() => useCheckout())
    await result.current.startCheckout({ plan: "pro_monthly" })
    const { orpcClient } = await import("@/utils/orpc/client")
    expect(orpcClient.billing.createCheckoutSession).toHaveBeenCalledWith({
      plan: "pro_monthly",
      successUrl: "chrome-extension://fakeid/upgrade-success.html",
      cancelUrl: "chrome-extension://fakeid/upgrade-success.html?cancelled=1",
    })
    const { default: browser } = await import("webextension-polyfill")
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: "https://pay.paddle.io/hsc_x" })
  })
})
```

- [ ] **Step 3: Implement `use-checkout.ts`**

```ts
import { useState, useCallback } from "react"
import browser from "webextension-polyfill"
import { orpcClient } from "@/utils/orpc/client"

type Plan = "pro_monthly" | "pro_yearly"

export function useCheckout() {
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const startCheckout = useCallback(async ({ plan }: { plan: Plan }) => {
    setLoading(true); setError(null)
    try {
      const successUrl = browser.runtime.getURL("upgrade-success.html")
      const cancelUrl = `${successUrl}?cancelled=1`
      const { url } = await orpcClient.billing.createCheckoutSession({ plan, successUrl, cancelUrl })
      await browser.tabs.create({ url })
    } catch (err) {
      setError(err as Error)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { startCheckout, isLoading, error }
}
```

- [ ] **Step 4: Write failing test for `useProExpiryEffect`**

```ts
// apps/extension/src/hooks/__tests__/use-pro-expiry-effect.test.tsx
// Mount hook with Jotai provider, mutate entitlements atom from pro→free, assert
// providersConfigAtom has getu-pro.enabled=false.
```

- [ ] **Step 5: Implement `use-pro-expiry-effect.ts`**

```ts
import { useEffect, useRef } from "react"
import { useAtom } from "jotai"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { providersConfigAtom } from "@/utils/atoms/provider"

export function useProExpiryEffect() {
  const [ent] = useAtom(entitlementsAtom)
  const [cfg, setCfg] = useAtom(providersConfigAtom)
  const prevTierRef = useRef<string | null>(null)

  useEffect(() => {
    const prev = prevTierRef.current
    const curr = ent?.tier ?? null
    if (prev === "pro" && curr === "free") {
      const getuPro = cfg?.["getu-pro"]
      if (getuPro?.enabled) {
        setCfg({ ...cfg, "getu-pro": { ...getuPro, enabled: false } })
      }
    }
    prevTierRef.current = curr
  }, [ent?.tier])
}
```

Mount this hook in a top-level component (e.g., `EntitlementsProvider` or root of `options`/`popup` entries). Subagent: find the right mount point by grep'ing for `useEntitlements` usage.

- [ ] **Step 6: Update `UpgradeDialog`** — add Checkout button + plan toggle (month/year)

```tsx
import { useCheckout } from "@/hooks/use-checkout"

export function UpgradeDialog({ open, onClose, feature }: Props) {
  const [plan, setPlan] = useState<"pro_monthly" | "pro_yearly">("pro_yearly")
  const [entitlements] = useAtom(entitlementsAtom)
  const { startCheckout, isLoading } = useCheckout()

  const disabled = !entitlements?.billingEnabled

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* existing copy */}
      <ToggleGroup value={plan} onValueChange={v => setPlan(v as any)}>
        <Toggle value="pro_monthly">$8/mo</Toggle>
        <Toggle value="pro_yearly">$72/yr · save 25%</Toggle>
      </ToggleGroup>
      <Button onClick={() => startCheckout({ plan })} disabled={disabled || isLoading}>
        {disabled ? "Coming soon" : isLoading ? "Loading…" : "Upgrade"}
      </Button>
    </Dialog>
  )
}
```

Match existing shadcn UI conventions. Update existing test.

- [ ] **Step 7: Create `upgrade-success` entrypoint**

`index.html` (WXT uses file-based entrypoints):
```html
<!doctype html>
<html><head><title>Upgrading…</title></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>
```

`main.tsx`:
```tsx
import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"
import { orpcClient } from "@/utils/orpc/client"

function UpgradeSuccess() {
  const params = new URLSearchParams(location.search)
  const cancelled = params.get("cancelled") === "1"
  const [status, setStatus] = useState<"polling" | "done" | "timeout">("polling")

  useEffect(() => {
    if (cancelled) return
    let attempts = 0
    const t = setInterval(async () => {
      attempts++
      try {
        const ent = await orpcClient.billing.getEntitlements({})
        if (ent.tier === "pro") { setStatus("done"); clearInterval(t); setTimeout(() => window.close(), 3000); return }
      } catch {}
      if (attempts >= 10) { setStatus("timeout"); clearInterval(t) }
    }, 3000)
    return () => clearInterval(t)
  }, [cancelled])

  if (cancelled) return <div style={{padding:40}}>Checkout cancelled. <a href="#" onClick={() => window.close()}>Close</a></div>
  if (status === "polling") return <div style={{padding:40}}>Payment received. Activating your Pro plan…</div>
  if (status === "done") return <div style={{padding:40}}>Pro activated ✓ · This tab will close shortly.</div>
  return <div style={{padding:40}}>Still processing. Check email for confirmation, then refresh.</div>
}

createRoot(document.getElementById("root")!).render(<UpgradeSuccess />)
```

- [ ] **Step 8: Register entrypoint in wxt.config** — WXT auto-detects `entrypoints/<name>/index.html`. Confirm by checking `wxt build` output lists `upgrade-success.html`.

- [ ] **Step 9: Local dev smoke test**
```bash
pnpm --filter @getu/extension dev
# install local build, navigate to chrome-extension://<id>/upgrade-success.html
# verify "Checkout cancelled" renders with ?cancelled=1
# verify polling branch with mock session
```

- [ ] **Step 10: Tests + type-check + lint**
```bash
pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension lint
```

- [ ] **Step 11: Commit + PR**
```bash
git commit -m "feat(extension): upgrade-success entrypoint + UpgradeDialog Checkout + Pro expiry effect"
```

---

## Task 6: Web `/price` Upgrade button + `/upgrade/success` page

**Files:**
- Modify: `apps/web/app/price/page.tsx`
- Create: `apps/web/app/upgrade/success/page.tsx`
- Create or modify: `apps/web/lib/orpc-client.ts` (shared factory)

- [ ] **Step 1: oRPC client factory for web** — if not exists, mirror extension's pattern

```ts
// apps/web/lib/orpc-client.ts
import { createORPCClient } from "@orpc/client"
import type { ORPCRouterClient } from "@getu/contract"

export const orpcClient = createORPCClient<ORPCRouterClient>({
  url: process.env.NEXT_PUBLIC_API_BASE_URL + "/orpc",
  fetch: (req) => fetch(req, { credentials: "include" }),
})
```

- [ ] **Step 2: Convert `/price` to client component with Upgrade button**

Since apps/web uses static export, Upgrade button must be a client component. Create `app/price/UpgradeButton.tsx`:

```tsx
"use client"
import { useState } from "react"
import { orpcClient } from "@/lib/orpc-client"

export function UpgradeButton({ plan }: { plan: "pro_monthly" | "pro_yearly" }) {
  const [loading, setLoading] = useState(false)
  async function onClick() {
    setLoading(true)
    try {
      const { url } = await orpcClient.billing.createCheckoutSession({
        plan,
        successUrl: `${location.origin}/upgrade/success`,
        cancelUrl: `${location.origin}/price`,
      })
      location.href = url
    } catch (err) {
      alert((err as Error).message)
      setLoading(false)
    }
  }
  return <button className="button primary" onClick={onClick} disabled={loading}>{loading ? "Loading…" : "Upgrade to Pro"}</button>
}
```

In `/price/page.tsx`, embed `<UpgradeButton plan="pro_yearly" />` in the Pro card.

Read `entitlements.billingEnabled` on client to switch to "Coming soon" disabled state.

- [ ] **Step 3: Create `/upgrade/success/page.tsx`**

```tsx
"use client"
import { useEffect, useState } from "react"
import { orpcClient } from "@/lib/orpc-client"

export default function SuccessPage() {
  const [status, setStatus] = useState<"polling" | "done" | "timeout">("polling")
  useEffect(() => {
    let n = 0
    const id = setInterval(async () => {
      n++
      try {
        const ent = await orpcClient.billing.getEntitlements({})
        if (ent.tier === "pro") { setStatus("done"); clearInterval(id); return }
      } catch {}
      if (n >= 10) { setStatus("timeout"); clearInterval(id) }
    }, 3000)
    return () => clearInterval(id)
  }, [])
  // simple UI copy matching extension's
}
```

- [ ] **Step 4: Build + smoke**
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8788 pnpm --filter @getu/web build
```

- [ ] **Step 5: Commit + PR**
```bash
git commit -m "feat(web): /price Upgrade button + /upgrade/success polling page"
```

---

## Task 7: Cron retention + usage_log token field population

**Files:**
- Create: `apps/api/src/scheduled/retention.ts`
- Create: `apps/api/src/scheduled/__tests__/retention.test.ts`
- Create: `apps/api/src/worker.ts` — merged fetch + scheduled entrypoint
- Modify: `apps/api/wrangler.toml` — `main = "src/worker.ts"` + `[triggers] crons`
- Modify: `apps/api/src/ai/proxy.ts` — pass model/tokens to chargeTokens
- Modify: `apps/api/src/billing/quota.ts` — `chargeTokens` signature accepts model+tokens

- [ ] **Step 1: Failing test — `retention.test.ts`**

```ts
describe("runRetention", () => {
  it("deletes usage_log rows older than 30 days", async () => {
    const db = await makeTestDb()
    // insert one old (40d), one recent (5d)
    const recent = Date.now() - 5 * 86400_000
    const old = Date.now() - 40 * 86400_000
    await db.insert(schema.usageLog).values([
      { id: "a", userId: "u", bucket: "ai_translate_monthly", amount: 1, requestId: "r1", createdAt: new Date(recent) },
      { id: "b", userId: "u", bucket: "ai_translate_monthly", amount: 1, requestId: "r2", createdAt: new Date(old) },
    ])
    await runRetention(db, { now: Date.now(), retentionDays: 30 })
    const rows = await db.select().from(schema.usageLog).all()
    expect(rows.map(r => r.id)).toEqual(["a"])
  })

  it("deletes billing_webhook_events older than 30 days", async () => {
    // similar
  })
})
```

- [ ] **Step 2: Implement `retention.ts`**

```ts
import { lt } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"

export async function runRetention(db: Db, opts: { now: number, retentionDays: number }) {
  const cutoff = new Date(opts.now - opts.retentionDays * 86400_000)
  await db.delete(schema.usageLog).where(lt(schema.usageLog.createdAt, cutoff))
  await db.delete(schema.billingWebhookEvents).where(lt(schema.billingWebhookEvents.receivedAt, cutoff))
}
```

- [ ] **Step 3: Merged Worker entrypoint**

```ts
// apps/api/src/worker.ts
import app from "./index"
import { createDb } from "@getu/db"
import { runRetention } from "./scheduled/retention"
import type { WorkerEnv } from "./env"

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    const db = createDb(env.DB)
    ctx.waitUntil(runRetention(db, { now: Date.now(), retentionDays: 30 }))
  },
}
```

Update `wrangler.toml`:
```toml
main = "src/worker.ts"

[triggers]
crons = ["0 3 * * *"]
```

- [ ] **Step 4: `usage_log` token fields population**

Find the `chargeTokens` call in `apps/api/src/billing/quota.ts` + `apps/api/src/ai/proxy.ts`. Extend signature:

```ts
// quota.ts
export async function chargeTokens(db: Db, args: {
  userId: string; bucket: string; amount: number; requestId: string;
  upstreamModel?: string; inputTokens?: number; outputTokens?: number;
}) {
  // insert usage_log with these extra fields populated
}
```

Update the proxy call site in `ai/proxy.ts`:
```ts
ctx.waitUntil(chargeTokens(db, {
  userId, bucket: "ai_translate_monthly", amount: units, requestId,
  upstreamModel: usage.model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens,
}))
```

Update existing tests to assert the new fields on the insert.

- [ ] **Step 5: Run tests + type-check**
```bash
pnpm --filter @getu/api test
pnpm --filter @getu/api type-check
```

- [ ] **Step 6: Deploy production + verify cron**
```bash
HTTP_PROXY="" HTTPS_PROXY="" NO_PROXY="*.cloudflare.com,*.pages.dev,*.workers.dev" \
  pnpm --filter @getu/api exec wrangler deploy --env production
HTTP_PROXY="" HTTPS_PROXY="" pnpm --filter @getu/api exec wrangler tail --env production
# Trigger a manual scheduled run via dashboard, confirm "[scheduled]" log entries
```

- [ ] **Step 7: Commit + PR**
```bash
git commit -m "feat(api): cron retention + usage_log model/token fields"
```

---

## Phase 4 Acceptance Criteria

- [ ] `pnpm -r test` green on main after all 7 PRs merge
- [ ] `pnpm -r type-check` green
- [ ] `pnpm -r lint` green
- [ ] Paddle sandbox end-to-end (manual):
  - [ ] Log in on `getutranslate.com`
  - [ ] Toggle `BILLING_ENABLED=true` in wrangler (override for testing)
  - [ ] Click `/price` Upgrade → Paddle sandbox checkout → pay with test card `4000 0566 5566 5556`
  - [ ] Redirected to `/upgrade/success`, polling shows tier=pro within 30s
  - [ ] Dashboard confirms `user_entitlements.tier='pro'`, `billing_provider='paddle'`
  - [ ] Re-run checkout → 412 `PRECONDITION_FAILED`
  - [ ] Call `createPortalSession` → 200 with Paddle portal url
  - [ ] In Paddle dashboard, cancel subscription → webhook fires → tier='free' after ≤30s
  - [ ] Simulate `subscription.past_due` via Paddle test event → `grace_until` populated
- [ ] Extension flow: trigger an `ai_translate_monthly` quota_exceeded → UpgradeDialog renders with plan toggle + functional Upgrade button
- [ ] Cron retention: production `wrangler tail --env production` shows scheduled run at 03:00 UTC logging "retention deleted N rows"
- [ ] `usage_log` new rows contain non-null `upstream_model`, `input_tokens`, `output_tokens`
- [ ] `BILLING_ENABLED=false` in prod correctly disables UpgradeDialog + `/price` buttons showing "Coming soon"

## Phase 4 Exit Handoff (to Phase 5)

After Paddle vendor approval:
1. `wrangler secret put PADDLE_API_KEY --env production` with real prod key
2. `wrangler secret put PADDLE_WEBHOOK_SECRET --env production` with real prod secret
3. `wrangler secret put PADDLE_PRICE_PRO_MONTHLY --env production` / `_YEARLY` with real prod price IDs
4. Update `[env.production.vars] PADDLE_BASE_URL = "https://api.paddle.com"` + `BILLING_ENABLED = "true"` via dashboard override or wrangler.toml
5. Re-deploy: `wrangler deploy --env production`
6. Register webhook URL `https://api.getutranslate.com/api/billing/webhook/paddle` in Paddle dashboard
7. Smoke test with real $8 monthly purchase → verify, refund via portal
8. Flip feature flag on

Phase 5 candidate scope: grace period banner UX, Stripe integration (for US card processors if Paddle conversion is low), discount codes / promos, annual → monthly downgrade flow.
