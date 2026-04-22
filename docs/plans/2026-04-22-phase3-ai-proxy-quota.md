# Phase 3 · AI Proxy + Server-Side Quota Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent roadmap:** [`docs/plans/2026-04-20-roadmap-vs-immersive-translate.md`](2026-04-20-roadmap-vs-immersive-translate.md)
> **Precursor plan:** [`docs/plans/2026-04-21-phase2-auth-free-tier.md`](2026-04-21-phase2-auth-free-tier.md) (merged, production live at `api.getutranslate.com`)
> **Contract authority:** [`docs/contracts/billing.md`](../contracts/billing.md) v1 §3–§4

**Goal:** Pro 用户通过 GetU Translate 后端 Worker 调用 AI（翻译 / 精读 / 输入框），后端转发到 [bianxie.ai](https://api.bianxie.ai) 聚合网关，按归一化 token 扣减 `ai_translate_monthly` 配额；`billing.getEntitlements` 从真实 D1 读取，`billing.consumeQuota` 幂等原子扣减。

**Architecture:**
- **Upstream：** 不做多 provider 适配 — 单一 upstream = bianxie.ai（OpenAI-compat 聚合网关），覆盖 GPT / Claude / Gemini。挂了就 503，无 fallback（风险登记）
- **计费单位：** 归一化 token（basis: gpt-4o-mini input token = 1 unit）；每模型一个 `inputUnitCost` / `outputUnitCost` 系数，放 `@getu/contract/src/ai-models.ts`
- **扣减触发点：** AI proxy 解析 SSE 末尾的 `usage` × 系数 → 调 `chargeTokens()` → 写 `usage_log` + 增 `quota_period.used`。扣减在 Worker 响应 **之后** 异步执行（`ctx.waitUntil`），不阻塞流
- **鉴权链：** 扩展 bg → `POST /ai/v1/token`（带 session cookie） → 15min JWT → AI 调用 `Authorization: Bearer <jwt>`
- **幂等：** `usage_log.request_id` UNIQUE；同 `(user_id, request_id)` 第 2 次调用返回首次结果不再扣减
- **Pro 账号制造：** 手动 `apps/api/scripts/grant-pro.ts <email>` 脚本（Phase 3）→ Stripe webhook（Phase 4）

**Tech Stack:** Cloudflare Workers (wrangler) · D1 · Drizzle ORM (sqlite) · `hono/jwt` · `@orpc/server` · Vercel AI SDK (`@ai-sdk/openai-compatible`) · zod · Dexie · Jotai

**Out of scope (Phase 4):**
- Stripe / Paddle checkout + webhook（`user_entitlements.stripe_customer_id` / `.stripe_subscription_id` / `.grace_until` 字段预留）
- `billing.createCheckoutSession` / `createPortalSession` 契约实装
- 真正付费通路；Phase 3 通过 `grant-pro.ts` 手动造 Pro 账号

**Out of scope (explicit non-Phase-3):**
- Follow-up issues [#25](https://github.com/getutranslate/getu-translate/issues/25) (AGENTS.md rebrand 长尾)、[#26](https://github.com/getutranslate/getu-translate/issues/26) (guide postMessage 协议)、[#31](https://github.com/getutranslate/getu-translate/issues/31) (next lint 迁移) — 与 Phase 3 正交
- **[#60](https://github.com/getutranslate/getu-translate/issues/60) 在 Task 0 里一起修**

**Duration estimate:** 7 working days (~2 calendar weeks).

---

## Pre-flight

- Main = Phase 2 完成（`f4eaddc` 及之后）；`api.getutranslate.com` / `getutranslate.com` 上线
- D1 已存在：`database_id = 903fa2ef-2aaa-4f20-b3a7-a2ef59a8cb70`；已有 `user` / `session` / `account` / `verification` 表
- **新增外部依赖：** bianxie.ai 账号 + API key（用户提供，`wrangler secret put BIANXIE_API_KEY --env production`）。本地 dev 写入 `apps/api/.dev.vars`
- 运维约定：所有 `wrangler` 命令前缀 `HTTP_PROXY="" HTTPS_PROXY="" NO_PROXY="*.cloudflare.com,*.pages.dev,*.workers.dev"`（见 [`project_cf_deploy_lessons.md`](../agents/memory/project_cf_deploy_lessons.md) §1）
- 每 Task 一个 worktree / branch / PR；Codex review 只对 Task 1/3/4/6 跑（Task 0/2/5 走 Claude reviewer 即可，参见 [`feedback_codex_review_scope.md`](../agents/memory/feedback_codex_review_scope.md)）

---

## File Structure (new / modified)

```
packages/contract/
  src/
    billing.ts                       # modified  — 加 consumeQuota 契约、QuotaBucketKey 常量
    ai-models.ts                     # NEW       — Pro 模型白名单 + 归一化系数表（共享给 api + extension）
    base.d.ts                        # regen     — #60：把 billingContract 合并进 ORPCRouterClient
    index.ts                         # modified  — 导出新符号

packages/db/
  src/schema/
    billing.ts                       # NEW       — user_entitlements / usage_log / quota_period
    index.ts                         # modified  — re-export billing schema
  drizzle/0001_billing.sql           # NEW       — migration

apps/api/
  src/
    env.ts                           # modified  — 加 BIANXIE_API_KEY / BIANXIE_BASE_URL / AI_JWT_SECRET
    index.ts                         # modified  — 挂 /ai/v1/* 路由
    orpc/
      billing.ts                     # modified  — getEntitlements 真查库；加 consumeQuota
      __tests__/billing.test.ts      # modified  — 加 consumeQuota 测试
    billing/
      entitlements.ts                # NEW       — loadEntitlements(userId, db): Entitlements
      quota.ts                       # NEW       — consumeQuota(ctx, bucket, amount, requestId)
      period.ts                      # NEW       — periodKey(bucket, now) 工具（日/月）
      __tests__/quota.test.ts        # NEW       — 幂等 / 超额 / 并发
      __tests__/period.test.ts       # NEW
    ai/
      proxy.ts                       # NEW       — /ai/v1/chat/completions 处理器
      jwt.ts                         # NEW       — /ai/v1/token 签发 + verify
      usage-parser.ts                # NEW       — SSE 尾部 usage 解析器
      __tests__/proxy.test.ts        # NEW
      __tests__/usage-parser.test.ts # NEW
      __tests__/jwt.test.ts          # NEW
  scripts/
    grant-pro.ts                     # NEW       — 手动造 Pro 账号
  wrangler.toml                      # modified  — 加 [vars] BIANXIE_BASE_URL
  package.json                       # modified  — +@getu/db、+hono (已有)、+eventsource-parser

apps/extension/
  src/
    types/entitlements.ts            # unchanged
    utils/
      billing/
        fetch-entitlements.ts        # modified  — 去掉 as any (#60 修好之后)
      ai/                            # NEW dir
        getu-pro-jwt.ts              # NEW       — 后台维护 JWT（取 / 过期刷新 / 失败回退）
        getu-pro-config.ts           # NEW       — createOpenAICompatible baseURL 工厂
      providers/
        model.ts                     # modified  — CREATE_AI_MAPPER 加 "getu-pro"；getLanguageModelById 特殊处理
      constants/
        models.ts                    # modified  — 加 "getu-pro" 到 LLM_PROVIDER_MODELS
        providers.ts                 # modified  — 加 PROVIDER_ITEMS["getu-pro"] / DEFAULT_PROVIDER_CONFIG["getu-pro"]
      config/
        migration-scripts/*          # modified  — 配置 schema 新增 getu-pro → 带迁移脚本
      atoms/provider.ts              # modified  — 过滤 getu-pro 在非 Pro 用户面前不可见
    types/config/provider.ts         # modified  — 加 "getu-pro" 到各 enum + baseSchema
    entrypoints/options/pages/api-providers/
      providers-config.tsx           # modified  — Pro gate UI
```

---

## Task Overview

| # | Title | Scope | Estimate | Codex |
|---|---|---|---|---|
| 0 | 契约 + 类型基础（含 #60） | `@getu/contract` | 0.5d | — |
| 1 | D1 schema: user_entitlements / usage_log / quota_period | `@getu/db` | 0.75d | ✓ |
| 2 | `billing.getEntitlements` 真实装 + `grant-pro.ts` | `apps/api` | 0.75d | — |
| 3 | `billing.consumeQuota` 实装（幂等、原子扣减） | `apps/api` | 1.5d | ✓ |
| 4 | AI Proxy：bianxie.ai 透传 + JWT + 用量扣减 | `apps/api` | 2d | ✓ |
| 5 | Rate limit | `apps/api` | 0.5d | — |
| 6 | 扩展端 GetU Pro 虚拟 provider + Pro gate UI | `apps/extension` | 1.5d | ✓ |

**Total ≈ 7.5 working days.**

**Critical path:** 0 → 1 → 3 → 4 → 6
**Parallelizable after 1:** 2 and 3 (same D1 schema, no code conflict)
**Last:** 5 (hardening), 6 (user-facing)

---

## Task 0: `@getu/contract` — billing 契约扩展 + #60 修复

**Files:**
- Modify: `packages/contract/src/billing.ts`
- Create: `packages/contract/src/ai-models.ts`
- Regenerate: `packages/contract/src/base.d.ts` (fixes [#60](https://github.com/getutranslate/getu-translate/issues/60))
- Modify: `packages/contract/src/index.ts`
- Create: `packages/contract/src/__tests__/ai-models.test.ts`
- Modify: `packages/contract/src/__tests__/billing.test.ts`

**Rationale:** 其它 Task 都依赖 `consumeQuotaContract` 的 zod input/output + `AI_MODEL_COEFFICIENTS` 常量。这个是地基。#60 修完以后 Task 6 的 `fetch-entitlements.ts` 就可以移除 `as any`，Task 3 新加的 `consumeQuota` 调用也能直接有类型。

- [ ] **Step 1: 写失败测试** — `packages/contract/src/__tests__/ai-models.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { AI_MODEL_COEFFICIENTS, PRO_MODEL_WHITELIST, isProModel, normalizeTokens } from "../ai-models"

describe("@getu/contract ai-models", () => {
  it("gpt-4o-mini is the basis (input=1, output=4)", () => {
    expect(AI_MODEL_COEFFICIENTS["gpt-4o-mini"]).toEqual({ inputUnitCost: 1, outputUnitCost: 4 })
  })

  it("PRO_MODEL_WHITELIST has 3 entries", () => {
    expect(PRO_MODEL_WHITELIST).toHaveLength(3)
    expect(PRO_MODEL_WHITELIST).toEqual(
      expect.arrayContaining(["gpt-4o-mini", "claude-3-5-sonnet-latest", "gemini-2.0-flash"]),
    )
  })

  it("isProModel() accepts whitelist", () => {
    expect(isProModel("gpt-4o-mini")).toBe(true)
    expect(isProModel("gpt-4o")).toBe(false)
  })

  it("normalizeTokens() multiplies by coefficients", () => {
    // gpt-4o-mini: 100 input @1 + 200 output @4 = 100 + 800 = 900 units
    expect(normalizeTokens("gpt-4o-mini", { input: 100, output: 200 })).toBe(900)
    // claude-3-5-sonnet-latest is more expensive — verify it's >> gpt-4o-mini
    expect(normalizeTokens("claude-3-5-sonnet-latest", { input: 100, output: 200 }))
      .toBeGreaterThan(900)
  })

  it("normalizeTokens() throws on unknown model", () => {
    expect(() => normalizeTokens("gpt-9000" as never, { input: 1, output: 1 })).toThrow(/unknown/i)
  })
})
```

Also extend `packages/contract/src/__tests__/billing.test.ts`:

```ts
import { consumeQuotaInputSchema, consumeQuotaOutputSchema, QUOTA_BUCKETS } from "../billing"

describe("billing.consumeQuota contract", () => {
  it("input accepts valid shape", () => {
    expect(() => consumeQuotaInputSchema.parse({
      bucket: "ai_translate_monthly",
      amount: 100,
      request_id: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    })).not.toThrow()
  })
  it("input rejects amount=0", () => {
    expect(() => consumeQuotaInputSchema.parse({
      bucket: "ai_translate_monthly", amount: 0, request_id: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    })).toThrow()
  })
  it("input rejects unknown bucket", () => {
    expect(() => consumeQuotaInputSchema.parse({
      bucket: "gold_credits", amount: 1, request_id: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    } as any)).toThrow()
  })
  it("output shape", () => {
    expect(() => consumeQuotaOutputSchema.parse({
      bucket: "ai_translate_monthly", remaining: 99900, reset_at: "2026-05-01T00:00:00.000Z",
    })).not.toThrow()
  })
  it("QUOTA_BUCKETS enumerates all contract-defined buckets", () => {
    expect(QUOTA_BUCKETS).toEqual(expect.arrayContaining([
      "input_translate_daily", "pdf_translate_daily", "vocab_count", "ai_translate_monthly",
    ]))
  })
})
```

- [ ] **Step 2: 运行测试确认 FAIL**

```bash
pnpm --filter @getu/contract test
# Expected: FAIL — "Cannot find module '../ai-models'" / "consumeQuotaInputSchema is not exported"
```

- [ ] **Step 3: 实装 `packages/contract/src/ai-models.ts`**

```ts
/**
 * AI model cost coefficients, normalized to gpt-4o-mini input token = 1 unit.
 * Update ONLY when bianxie.ai pricing changes or we add a new whitelist entry.
 * Output cost is typically 3-4x input cost per the underlying provider pricing.
 */
export const AI_MODEL_COEFFICIENTS = {
  "gpt-4o-mini": { inputUnitCost: 1, outputUnitCost: 4 },
  // Claude 3.5 Sonnet: ~20x gpt-4o-mini input, ~25x output (bianxie.ai pricing as of 2026-04)
  "claude-3-5-sonnet-latest": { inputUnitCost: 20, outputUnitCost: 25 },
  // Gemini 2.0 Flash: close to gpt-4o-mini, slightly cheaper output
  "gemini-2.0-flash": { inputUnitCost: 1, outputUnitCost: 3 },
} as const

export type ProModel = keyof typeof AI_MODEL_COEFFICIENTS

export const PRO_MODEL_WHITELIST = Object.keys(AI_MODEL_COEFFICIENTS) as readonly ProModel[]

export function isProModel(m: string): m is ProModel {
  return m in AI_MODEL_COEFFICIENTS
}

export function normalizeTokens(
  model: ProModel,
  tokens: { input: number, output: number },
): number {
  const coef = AI_MODEL_COEFFICIENTS[model]
  if (!coef) throw new Error(`normalizeTokens: unknown model '${model}'`)
  return Math.ceil(tokens.input * coef.inputUnitCost + tokens.output * coef.outputUnitCost)
}
```

- [ ] **Step 4: 扩展 `packages/contract/src/billing.ts`**

追加（不改已有导出）:

```ts
// ---- consumeQuota contract ----

export const QUOTA_BUCKETS = [
  "input_translate_daily",
  "pdf_translate_daily",
  "vocab_count",
  "ai_translate_monthly",
] as const
export type QuotaBucket = (typeof QUOTA_BUCKETS)[number]

// UUID v4/v7 accepted; 16 chars+
const requestIdSchema = z.string().min(16).max(128)

export const consumeQuotaInputSchema = z.object({
  bucket: z.enum(QUOTA_BUCKETS),
  amount: z.number().int().positive(),
  request_id: requestIdSchema,
}).strict()
export type ConsumeQuotaInput = z.infer<typeof consumeQuotaInputSchema>

export const consumeQuotaOutputSchema = z.object({
  bucket: z.enum(QUOTA_BUCKETS),
  remaining: z.number().int().nonnegative().nullable(),
  reset_at: z.string().datetime().nullable(),
})
export type ConsumeQuotaOutput = z.infer<typeof consumeQuotaOutputSchema>

export const billingContract = oc.router({
  getEntitlements: oc.input(z.object({}).strict()).output(EntitlementsSchema),
  consumeQuota: oc.input(consumeQuotaInputSchema).output(consumeQuotaOutputSchema),
})
```

- [ ] **Step 5: 修复 [#60](https://github.com/getutranslate/getu-translate/issues/60) — 重新生成 `base.d.ts`**

目前 `packages/contract/src/base.d.ts` 来自旧 upstream `@read-frog/api-contract`，不认识 `billingContract`。改造方案：**不重新从上游拉**，而是在 `index.ts` 用合并 contract 自己生成 `ORPCRouterClient` 类型。

修改 `packages/contract/src/index.ts`（保留现有 `export { ... } from "./base.js"`，但替换 `ORPCRouterClient` 的导出方式）:

```ts
// 现有 export { contract, ... } from "./base.js" 保持
// 删除现有 export type { ORPCRouterClient, ... } from "./base.js" 里的 ORPCRouterClient
// 新增：
import type { ContractRouterClient } from "@orpc/contract"
import { contract as baseContract } from "./base.js"
import { billingContract } from "./billing.js"

export const mergedContract = {
  ...baseContract,
  billing: billingContract,
} as const

export type ORPCRouterClient = ContractRouterClient<typeof mergedContract>
```

同时追加：

```ts
export { consumeQuotaInputSchema, consumeQuotaOutputSchema, QUOTA_BUCKETS } from "./billing.js"
export type { ConsumeQuotaInput, ConsumeQuotaOutput, QuotaBucket } from "./billing.js"
export { AI_MODEL_COEFFICIENTS, PRO_MODEL_WHITELIST, isProModel, normalizeTokens } from "./ai-models.js"
export type { ProModel } from "./ai-models.js"
```

- [ ] **Step 6: 运行测试确认 PASS**

```bash
pnpm --filter @getu/contract test
# Expected: PASS (new tests + existing)

pnpm -r type-check
# Expected: PASS (including apps/api, apps/extension)
```

- [ ] **Step 7: 去掉 extension 端的 `as any`**

修改 `apps/extension/src/utils/billing/fetch-entitlements.ts`:

```ts
import { orpcClient } from "@/utils/orpc/client"
import type { Entitlements } from "@/types/entitlements"

export async function fetchEntitlementsFromBackend(): Promise<Entitlements> {
  return orpcClient.billing.getEntitlements({})
}
```

运行 `pnpm --filter @getu/extension type-check` → PASS。

- [ ] **Step 8: Commit + PR**

```bash
git switch -c feat/phase3-task-0-contract
git add packages/contract apps/extension/src/utils/billing
git commit -m "feat(contract): add consumeQuota + ai-models, regenerate ORPCRouterClient (closes #60)"
gh pr create --base main --title "feat(contract): add consumeQuota contract + AI model coefficients, fix #60" \
  --body "Closes #60"
```

---

## Task 1: `@getu/db` — billing schema + migration

**Files:**
- Create: `packages/db/src/schema/billing.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/drizzle/0001_billing.sql` (generated)

**Rationale:** 所有后端逻辑都读写这三张表。schema 必须为 Phase 4 留字段，避免 Phase 4 加字段触发第二次迁移（D1 `ALTER TABLE ADD COLUMN` 能用但测试链冗长，一次到位更好）。

- [ ] **Step 1: 新增 `packages/db/src/schema/billing.ts`**

```ts
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"

const unixMsDefault = sql`(CAST(unixepoch('now','subsec') * 1000 AS INTEGER))`

/**
 * Per-user commercialized tier + feature flags + Stripe linkage.
 * Phase 3 populates only: userId, tier, features, expiresAt.
 * Phase 4 webhook populates: stripeCustomerId, stripeSubscriptionId, graceUntil.
 */
export const userEntitlements = sqliteTable("user_entitlements", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["free", "pro", "enterprise"] }).notNull().default("free"),
  // JSON array of FeatureKey — stored as TEXT, parsed in app layer
  features: text("features").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  // Phase 4 fields — nullable, never written in Phase 3
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  graceUntil: integer("grace_until", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
})

/**
 * Raw quota consumption log. Append-only. Idempotent via (userId, requestId).
 * Retained 30 days (cleaned by a future cron; not in Phase 3 scope).
 */
export const usageLog = sqliteTable("usage_log", {
  id: text("id").primaryKey(), // uuid v7 generated server-side
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  bucket: text("bucket").notNull(),
  amount: integer("amount").notNull(),
  requestId: text("request_id").notNull(),
  // AI-proxy-only fields
  upstreamModel: text("upstream_model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
}, t => ({
  idemp: uniqueIndex("usage_log_user_request_uidx").on(t.userId, t.requestId),
  byBucket: index("usage_log_user_bucket_idx").on(t.userId, t.bucket, t.createdAt),
}))

/**
 * Pre-aggregated quota by (user, bucket, period_key).
 *   period_key = "YYYY-MM-DD" for *_daily buckets
 *              = "YYYY-MM"    for *_monthly buckets
 *              = "lifetime"   for lifetime buckets (vocab_count)
 * Updated atomically together with usage_log inserts.
 */
export const quotaPeriod = sqliteTable("quota_period", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  bucket: text("bucket").notNull(),
  periodKey: text("period_key").notNull(),
  used: integer("used").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(unixMsDefault),
}, t => ({
  pk: uniqueIndex("quota_period_pk").on(t.userId, t.bucket, t.periodKey),
}))
```

- [ ] **Step 2: 导出**

修改 `packages/db/src/schema/index.ts`:

```ts
export * from "./auth"
export * from "./billing"
```

- [ ] **Step 3: 生成 migration SQL**

```bash
cd /Users/andy.peng/workspace/repo/getu-translate
pnpm --filter @getu/db exec drizzle-kit generate --name billing
```

检查生成的 `packages/db/drizzle/0001_billing.sql`，期望包含：
- `CREATE TABLE user_entitlements`
- `CREATE TABLE usage_log`
- `CREATE UNIQUE INDEX usage_log_user_request_uidx`
- `CREATE INDEX usage_log_user_bucket_idx`
- `CREATE TABLE quota_period`
- `CREATE UNIQUE INDEX quota_period_pk`

如果生成结果与预期有偏差，手工调整 SQL 而非改 schema（schema 代表真实意图）。

- [ ] **Step 4: 本地 D1 跑 migration 冒烟**

```bash
HTTP_PROXY="" pnpm --filter @getu/api exec wrangler d1 execute getu-translate --local \
  --file=../../packages/db/drizzle/0001_billing.sql

HTTP_PROXY="" pnpm --filter @getu/api exec wrangler d1 execute getu-translate --local \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# Expected: account, quota_period, session, usage_log, user, user_entitlements, verification
```

- [ ] **Step 5: Type check**

```bash
pnpm -r type-check
```

- [ ] **Step 6: Commit + PR**

```bash
git switch -c feat/phase3-task-1-db-schema
git add packages/db
git commit -m "feat(db): add user_entitlements, usage_log, quota_period tables"
gh pr create --base main --title "feat(db): add billing schema (entitlements, usage_log, quota_period)" \
  --body "Phase 3 Task 1. Schema freezes Phase 4 Stripe fields (stripe_customer_id, grace_until) up front."
```

---

## Task 2: `billing.getEntitlements` 真实装 + `grant-pro.ts`

**Files:**
- Create: `apps/api/src/billing/entitlements.ts`
- Create: `apps/api/src/billing/__tests__/entitlements.test.ts`
- Modify: `apps/api/src/orpc/billing.ts`
- Modify: `apps/api/src/orpc/__tests__/billing.test.ts`
- Create: `apps/api/scripts/grant-pro.ts`

- [ ] **Step 1: 写失败测试** — `apps/api/src/billing/__tests__/entitlements.test.ts`

```ts
import { describe, expect, it, vi } from "vitest"
import { loadEntitlements } from "../entitlements"

// Minimal in-memory fake for the drizzle D1 query interface we use
function fakeDb(rows: Array<{ userId: string, tier: string, features: string, expiresAt: number | null }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => rows[0] ?? undefined,
        }),
      }),
    }),
  } as any
}

describe("loadEntitlements", () => {
  it("returns FREE when no row exists", async () => {
    const e = await loadEntitlements(fakeDb([]), "u1")
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
    expect(e.expiresAt).toBeNull()
    expect(e.quota).toEqual({})
  })

  it("returns Pro when row exists with tier=pro and features", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1",
      tier: "pro",
      features: JSON.stringify(["ai_translate_pool", "pdf_translate"]),
      expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
    }]), "u1")
    expect(e.tier).toBe("pro")
    expect(e.features).toContain("ai_translate_pool")
    expect(e.expiresAt).toBe("2099-01-01T00:00:00.000Z")
  })

  it("downgrades to FREE when expiresAt is in the past", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1", tier: "pro",
      features: JSON.stringify(["ai_translate_pool"]),
      expiresAt: Date.now() - 86400_000,
    }]), "u1")
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
  })

  it("rejects malformed features JSON by falling back to FREE features", async () => {
    const e = await loadEntitlements(fakeDb([{
      userId: "u1", tier: "pro",
      features: "not-json", expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
    }]), "u1")
    expect(e.features).toEqual([])
  })
})
```

- [ ] **Step 2: 验证 FAIL**

```bash
pnpm --filter @getu/api test src/billing/__tests__/entitlements.test.ts
# Expected: FAIL — Cannot find module
```

- [ ] **Step 3: 实装 `apps/api/src/billing/entitlements.ts`**

```ts
import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { userEntitlements } from "@getu/db/src/schema/billing"
import { FREE_ENTITLEMENTS, FeatureKey, type Entitlements, type FeatureKey as FK } from "@getu/contract"

function parseFeatures(raw: string): FK[] {
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is FK => FeatureKey.safeParse(x).success)
  } catch {
    return []
  }
}

export async function loadEntitlements(db: Db, userId: string): Promise<Entitlements> {
  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  if (!row) return FREE_ENTITLEMENTS

  const expired = row.expiresAt != null && row.expiresAt.getTime() < Date.now()
  if (row.tier === "free" || expired) return FREE_ENTITLEMENTS

  return {
    tier: row.tier,
    features: parseFeatures(row.features),
    quota: {}, // populated by a follow-up call in Task 3; Phase 3 returns {} here
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }
}
```

- [ ] **Step 4: 改 oRPC handler** — `apps/api/src/orpc/billing.ts`

```ts
import { createDb } from "@getu/db"
import { loadEntitlements } from "../billing/entitlements"
import { authed } from "./context"

export const billingRouter = {
  getEntitlements: authed.handler(async ({ context }) => {
    const db = createDb(context.env.DB)
    return loadEntitlements(db, context.session.user.id)
  }),
}
```

- [ ] **Step 5: 扩展 oRPC test** — `apps/api/src/orpc/__tests__/billing.test.ts`

保留现有 "rejects anonymous" 测试；把 "returns free tier" 改成真的经过 `loadEntitlements`，用 vi mock:

```ts
import { vi } from "vitest"

vi.mock("@getu/db", () => ({
  createDb: vi.fn(() => ({ /* 返回 fakeDb */ })),
}))
vi.mock("../../billing/entitlements", () => ({
  loadEntitlements: vi.fn(async () => ({ tier: "free", features: [], quota: {}, expiresAt: null })),
}))
// ... 然后测试走 router 端到端，断言 loadEntitlements 被调用 + session.user.id 正确传递
```

- [ ] **Step 6: 运行所有相关测试确认 PASS**

```bash
pnpm --filter @getu/api test
# Expected: all pass
```

- [ ] **Step 7: 新增 `apps/api/scripts/grant-pro.ts`**

```ts
/**
 * Usage:
 *   HTTP_PROXY="" pnpm --filter @getu/api exec tsx scripts/grant-pro.ts --email=user@example.com --days=365
 *
 * Manually grants Pro tier to a user by email. Phase 4 replaces with Stripe webhook.
 * Runs as a one-shot wrangler d1 execute — needs HTTP_PROXY="" per project_cf_deploy_lessons.md.
 */
import { execSync } from "node:child_process"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    days: { type: "string", default: "365" },
    env: { type: "string", default: "production" },
    features: {
      type: "string",
      default: "ai_translate_pool,pdf_translate,input_translate_unlimited,vocab_unlimited",
    },
  },
})

if (!values.email) {
  console.error("Usage: grant-pro.ts --email=<email> [--days=365] [--env=production|local]")
  process.exit(1)
}

const email = values.email
const expiresAt = Date.now() + Number(values.days) * 86400_000
const features = JSON.stringify(values.features!.split(","))
const envFlag = values.env === "local" ? "--local" : "--remote"

function d1(cmd: string): string {
  return execSync(
    `wrangler d1 execute getu-translate ${envFlag} --json --command=${JSON.stringify(cmd)}`,
    { encoding: "utf8", env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "" } },
  )
}

// 1. Look up user id
const lookup = JSON.parse(d1(`SELECT id FROM user WHERE email = '${email.replace(/'/g, "''")}'`))
const userId: string | undefined = lookup?.[0]?.results?.[0]?.id
if (!userId) {
  console.error(`No user found with email ${email}`)
  process.exit(2)
}

// 2. Upsert entitlements
d1(`
  INSERT INTO user_entitlements (user_id, tier, features, expires_at, updated_at)
  VALUES ('${userId}', 'pro', '${features.replace(/'/g, "''")}', ${expiresAt}, strftime('%s','now')*1000)
  ON CONFLICT(user_id) DO UPDATE SET
    tier = 'pro',
    features = excluded.features,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
`)

console.log(`✓ Granted Pro to ${email} (user_id=${userId}, expires=${new Date(expiresAt).toISOString()})`)
```

Add script to `apps/api/package.json`:

```json
"scripts": {
  "grant-pro": "tsx scripts/grant-pro.ts"
}
```

Add `tsx` to devDependencies:

```bash
pnpm add -F @getu/api -D tsx
```

- [ ] **Step 8: 本地冒烟**

```bash
pnpm --filter @getu/api dev &
sleep 6
# Sign up a test user via /api/identity/sign-up/email (or UI)
# Then:
pnpm --filter @getu/api exec tsx scripts/grant-pro.ts --email=me@example.com --days=30 --env=local
# Expected: "✓ Granted Pro to me@example.com ..."

# Verify
curl -s --cookie 'better-auth.session_token=<paste>' http://localhost:8788/orpc/billing/getEntitlements \
  -H 'content-type: application/json' -d '{}'
# Expected: { "tier": "pro", "features": [...], ... }
kill %1
```

- [ ] **Step 9: Commit + PR**

```bash
git switch -c feat/phase3-task-2-entitlements
git add apps/api packages
git commit -m "feat(api): billing.getEntitlements reads from D1; add grant-pro.ts admin script"
gh pr create --base main --title "feat(api): real billing.getEntitlements + grant-pro script"
```

---

## Task 3: `billing.consumeQuota` 实装（幂等 + 原子扣减）

**Files:**
- Create: `apps/api/src/billing/period.ts`
- Create: `apps/api/src/billing/quota.ts`
- Create: `apps/api/src/billing/__tests__/period.test.ts`
- Create: `apps/api/src/billing/__tests__/quota.test.ts`
- Modify: `apps/api/src/orpc/billing.ts`
- Modify: `apps/api/src/orpc/index.ts` (not needed — router already imports billingRouter)
- Modify: `apps/api/src/orpc/__tests__/billing.test.ts`

**Key design decisions:**
- **Atomicity:** D1 `db.batch([insertUsageLog, upsertQuotaPeriod])` runs inside a single transaction per Cloudflare D1 docs. If either fails both roll back.
- **Idempotency:** `usage_log (user_id, request_id)` UNIQUE index. On conflict, look up the existing row and return the first-call result (including `remaining`).
- **Quota limits source:** Phase 3 hardcodes limits matching [`docs/contracts/billing.md`](../contracts/billing.md) §3.2. Reads `user_entitlements.tier` to decide Pro vs Free caps.

- [ ] **Step 1: 写 period.ts 失败测试**

```ts
// apps/api/src/billing/__tests__/period.test.ts
import { describe, expect, it } from "vitest"
import { periodKey, periodResetIso } from "../period"

describe("periodKey", () => {
  const fixed = new Date("2026-04-22T15:03:00.000Z")

  it("daily → YYYY-MM-DD UTC", () => {
    expect(periodKey("input_translate_daily", fixed)).toBe("2026-04-22")
    expect(periodKey("pdf_translate_daily", fixed)).toBe("2026-04-22")
  })

  it("monthly → YYYY-MM UTC", () => {
    expect(periodKey("ai_translate_monthly", fixed)).toBe("2026-04")
  })

  it("lifetime → 'lifetime'", () => {
    expect(periodKey("vocab_count", fixed)).toBe("lifetime")
  })
})

describe("periodResetIso", () => {
  it("daily → next UTC midnight", () => {
    const now = new Date("2026-04-22T15:03:00.000Z")
    expect(periodResetIso("input_translate_daily", now)).toBe("2026-04-23T00:00:00.000Z")
  })
  it("monthly → first of next month UTC", () => {
    const now = new Date("2026-04-22T15:03:00.000Z")
    expect(periodResetIso("ai_translate_monthly", now)).toBe("2026-05-01T00:00:00.000Z")
  })
  it("lifetime → null", () => {
    expect(periodResetIso("vocab_count", new Date())).toBeNull()
  })
})
```

- [ ] **Step 2: 实装 `period.ts`**

```ts
import type { QuotaBucket } from "@getu/contract"

function utcYmd(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}
function utcYm(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function periodKey(bucket: QuotaBucket, now: Date): string {
  if (bucket.endsWith("_daily")) return utcYmd(now)
  if (bucket.endsWith("_monthly")) return utcYm(now)
  return "lifetime"
}

export function periodResetIso(bucket: QuotaBucket, now: Date): string | null {
  if (bucket.endsWith("_daily")) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    return next.toISOString()
  }
  if (bucket.endsWith("_monthly")) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return next.toISOString()
  }
  return null
}
```

Verify: `pnpm --filter @getu/api test src/billing/__tests__/period.test.ts` → PASS.

- [ ] **Step 3: 写 quota.ts 失败测试**

```ts
// apps/api/src/billing/__tests__/quota.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { consumeQuota, QUOTA_LIMITS } from "../quota"

function makeDb() {
  const usageRows: any[] = []
  const quotaRows = new Map<string, { used: number }>()
  const entRows = new Map<string, { tier: string }>()
  return {
    usageRows, quotaRows, entRows,
    // simulate drizzle db.batch: runs statements "transactionally"
    batch: vi.fn(async (fns: Array<() => Promise<void>>) => { for (const fn of fns) await fn() }),
    // actual query helpers are mocked inline per test
    _insertUsageLog(row: any) { usageRows.push(row) },
    _getUsage(userId: string, requestId: string) {
      return usageRows.find(r => r.userId === userId && r.requestId === requestId)
    },
    _upsertPeriod(userId: string, bucket: string, periodKey: string, delta: number) {
      const k = `${userId}|${bucket}|${periodKey}`
      const row = quotaRows.get(k) ?? { used: 0 }
      row.used += delta
      quotaRows.set(k, row)
    },
    _getPeriod(userId: string, bucket: string, periodKey: string) {
      return quotaRows.get(`${userId}|${bucket}|${periodKey}`)
    },
  }
}

describe("consumeQuota", () => {
  it("succeeds when under limit — Pro ai_translate_monthly", async () => {
    const db = makeDb()
    db.entRows.set("u1", { tier: "pro" })
    const res = await consumeQuota(db as any, "u1", "ai_translate_monthly", 1000, "req-1", new Date("2026-04-22T00:00:00Z"))
    expect(res.remaining).toBe(QUOTA_LIMITS.pro.ai_translate_monthly - 1000)
    expect(res.reset_at).toBe("2026-05-01T00:00:00.000Z")
  })

  it("throws QUOTA_EXCEEDED when over limit", async () => {
    const db = makeDb()
    db.entRows.set("u1", { tier: "pro" })
    await consumeQuota(db as any, "u1", "ai_translate_monthly", 99_999, "req-a", new Date("2026-04-22T00:00:00Z"))
    await expect(
      consumeQuota(db as any, "u1", "ai_translate_monthly", 10, "req-b", new Date("2026-04-22T00:00:00Z")),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" })
  })

  it("throws FORBIDDEN when Free user hits ai_translate_monthly (limit=0)", async () => {
    const db = makeDb()
    db.entRows.set("u1", { tier: "free" })
    await expect(
      consumeQuota(db as any, "u1", "ai_translate_monthly", 1, "req-1", new Date()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("is idempotent — same request_id second call returns first result", async () => {
    const db = makeDb()
    db.entRows.set("u1", { tier: "pro" })
    const first = await consumeQuota(db as any, "u1", "ai_translate_monthly", 100, "req-x", new Date("2026-04-22T00:00:00Z"))
    const second = await consumeQuota(db as any, "u1", "ai_translate_monthly", 100, "req-x", new Date("2026-04-22T00:00:00Z"))
    expect(second).toEqual(first)
    expect(db.usageRows.length).toBe(1) // no double write
  })

  it("daily bucket resets across period keys", async () => {
    const db = makeDb()
    db.entRows.set("u1", { tier: "free" })
    await consumeQuota(db as any, "u1", "input_translate_daily", 50, "req-1", new Date("2026-04-22T12:00:00Z"))
    // day 2 — independent counter
    const res = await consumeQuota(db as any, "u1", "input_translate_daily", 1, "req-2", new Date("2026-04-23T01:00:00Z"))
    expect(res.remaining).toBe(QUOTA_LIMITS.free.input_translate_daily - 1)
  })
})
```

- [ ] **Step 4: 实装 `quota.ts`**

```ts
// apps/api/src/billing/quota.ts
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"
import { sql } from "drizzle-orm"
import type { Db } from "@getu/db"
import { userEntitlements, usageLog, quotaPeriod } from "@getu/db/src/schema/billing"
import { type QuotaBucket, type ConsumeQuotaOutput } from "@getu/contract"
import { periodKey, periodResetIso } from "./period"

// From docs/contracts/billing.md §3.2
export const QUOTA_LIMITS = {
  free: {
    input_translate_daily: 50,
    pdf_translate_daily: 50,
    vocab_count: 100,
    ai_translate_monthly: 0, // Phase 3: Free users forbidden
  },
  pro: {
    input_translate_daily: null, // unlimited
    pdf_translate_daily: null,
    vocab_count: null,
    ai_translate_monthly: 100_000, // confirmed in brainstorm
  },
  enterprise: {
    input_translate_daily: null,
    pdf_translate_daily: null,
    vocab_count: null,
    ai_translate_monthly: null,
  },
} as const satisfies Record<"free" | "pro" | "enterprise", Record<QuotaBucket, number | null>>

function limitFor(tier: keyof typeof QUOTA_LIMITS, bucket: QuotaBucket): number | null {
  return QUOTA_LIMITS[tier][bucket]
}

export async function consumeQuota(
  db: Db,
  userId: string,
  bucket: QuotaBucket,
  amount: number,
  requestId: string,
  now: Date = new Date(),
): Promise<ConsumeQuotaOutput> {
  // 1. Idempotency check: existing row for (userId, requestId)?
  const existing = await db.select().from(usageLog)
    .where(and(eq(usageLog.userId, userId), eq(usageLog.requestId, requestId)))
    .get()
  if (existing) {
    // Rebuild response from stored row + current period state
    const pk = periodKey(bucket, now)
    const period = await db.select().from(quotaPeriod)
      .where(and(eq(quotaPeriod.userId, userId), eq(quotaPeriod.bucket, bucket), eq(quotaPeriod.periodKey, pk)))
      .get()
    const ent = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
    const tier = (ent?.tier as keyof typeof QUOTA_LIMITS) ?? "free"
    const lim = limitFor(tier, bucket)
    const used = period?.used ?? 0
    return {
      bucket,
      remaining: lim == null ? null : Math.max(0, lim - used),
      reset_at: periodResetIso(bucket, now),
    }
  }

  // 2. Resolve tier and limit
  const ent = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  const tier = (ent?.tier as keyof typeof QUOTA_LIMITS) ?? "free"
  const lim = limitFor(tier, bucket)

  // 3. Free tier accessing Pro-only bucket → FORBIDDEN
  if (tier === "free" && bucket === "ai_translate_monthly") {
    throw new ORPCError("FORBIDDEN", { message: "Free tier cannot access ai_translate_monthly" })
  }

  // 4. Capacity check
  const pk = periodKey(bucket, now)
  const period = await db.select().from(quotaPeriod)
    .where(and(eq(quotaPeriod.userId, userId), eq(quotaPeriod.bucket, bucket), eq(quotaPeriod.periodKey, pk)))
    .get()
  const used = period?.used ?? 0
  if (lim != null && used + amount > lim) {
    throw new ORPCError("QUOTA_EXCEEDED", {
      message: `Bucket ${bucket} exceeded: used=${used}, amount=${amount}, limit=${lim}`,
    })
  }

  // 5. Atomic write: insert usage_log + upsert quota_period
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(usageLog).values({ id, userId, bucket, amount, requestId, createdAt: now }),
    db.insert(quotaPeriod)
      .values({ userId, bucket, periodKey: pk, used: amount, updatedAt: now })
      .onConflictDoUpdate({
        target: [quotaPeriod.userId, quotaPeriod.bucket, quotaPeriod.periodKey],
        set: { used: sql`${quotaPeriod.used} + ${amount}`, updatedAt: now },
      }),
  ])

  return {
    bucket,
    remaining: lim == null ? null : lim - (used + amount),
    reset_at: periodResetIso(bucket, now),
  }
}
```

> **Note:** The fake `makeDb` in tests doesn't exercise Drizzle's real query builders — it's a lightweight shim. For D1-level transaction semantics we rely on **Task 4's integration smoke test** against local wrangler. If tests here pass but production breaks on batch semantics, fix with `wrangler d1 execute --local` reproducer.

Test refinement: the existing `fakeDb` in the test file doesn't match drizzle's API. Rewrite the test to mock at the drizzle level with a narrow interface:

```ts
const drizzleFake = {
  select: vi.fn(() => ({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), get: vi.fn(async () => undefined) })),
  insert: vi.fn(() => ({ values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockReturnThis() })),
  batch: vi.fn(async (_arr: any[]) => {}),
}
// Assert drizzleFake.batch.mock.calls.length === 1, drizzleFake.insert called with usageLog + quotaPeriod, etc.
```

- [ ] **Step 5: 把 consumeQuota 挂到 oRPC** — `apps/api/src/orpc/billing.ts`

```ts
import { createDb } from "@getu/db"
import { loadEntitlements } from "../billing/entitlements"
import { consumeQuota as consumeQuotaImpl } from "../billing/quota"
import { consumeQuotaInputSchema, consumeQuotaOutputSchema } from "@getu/contract"
import { authed } from "./context"

export const billingRouter = {
  getEntitlements: authed.handler(async ({ context }) => {
    const db = createDb(context.env.DB)
    return loadEntitlements(db, context.session.user.id)
  }),
  consumeQuota: authed
    .input(consumeQuotaInputSchema)
    .output(consumeQuotaOutputSchema)
    .handler(async ({ context, input }) => {
      const db = createDb(context.env.DB)
      return consumeQuotaImpl(db, context.session.user.id, input.bucket, input.amount, input.request_id)
    }),
}
```

- [ ] **Step 6: 扩 oRPC 测试** — 加 3 个 consumeQuota e2e 测试（through router，mock loadEntitlements + consumeQuotaImpl 各 1 次）

- [ ] **Step 7: Type check + all tests**

```bash
pnpm -r type-check && pnpm --filter @getu/api test
```

- [ ] **Step 8: 本地集成冒烟**

启 `wrangler dev`；用 `grant-pro.ts` 造 Pro 账号；call `/orpc/billing/consumeQuota` 两次同 request_id 验证幂等；用超额请求验证 402。

- [ ] **Step 9: Commit + PR**

```bash
git switch -c feat/phase3-task-3-consume-quota
git add apps/api
git commit -m "feat(api): billing.consumeQuota with idempotency and atomic D1 batch"
gh pr create --base main --title "feat(api): billing.consumeQuota (Phase 3 Task 3)"
```

---

## Task 4: AI Proxy — bianxie.ai 透传 + JWT + 用量扣减

**Files:**
- Modify: `apps/api/src/env.ts` (add BIANXIE_API_KEY, BIANXIE_BASE_URL, AI_JWT_SECRET)
- Create: `apps/api/src/ai/jwt.ts`
- Create: `apps/api/src/ai/usage-parser.ts`
- Create: `apps/api/src/ai/proxy.ts`
- Create: `apps/api/src/ai/__tests__/jwt.test.ts`
- Create: `apps/api/src/ai/__tests__/usage-parser.test.ts`
- Create: `apps/api/src/ai/__tests__/proxy.test.ts`
- Modify: `apps/api/src/index.ts` (mount /ai/v1/*)
- Modify: `apps/api/wrangler.toml` (add BIANXIE_BASE_URL var)
- Modify: `apps/api/package.json` (add hono/jwt support; add eventsource-parser if not sibling)

**Key design:**
- `/ai/v1/token`：POST，带 session cookie，签发 15min HS256 JWT（payload: `{ sub: userId, exp }`）。放在 hono 原生路由，不走 oRPC（避免 oRPC 默认的 RPCHandler 协议开销）
- `/ai/v1/chat/completions`：POST，Bearer JWT 鉴权 → 校验 model 在 `PRO_MODEL_WHITELIST` → 透传到 `${BIANXIE_BASE_URL}/chat/completions` → 流式响应直接 `return res`。末尾 usage 解析用 `ctx.waitUntil()` 异步扣减（不阻塞客户端）
- `usage-parser.ts`：tee response body，边读边转发；在末尾解析 `data: [DONE]` 前一个 chunk 的 `usage.{prompt,completion}_tokens`
- 失败扣减（bianxie.ai usage 字段缺失）：降级记 **最小值** `1`，记一条 WARN log，避免给用户免费午餐

- [ ] **Step 1: Env + wrangler.toml**

`apps/api/src/env.ts` 加：

```ts
export interface WorkerEnv {
  DB: D1Database
  AUTH_SECRET: string
  AUTH_BASE_URL: string
  ALLOWED_EXTENSION_ORIGINS: string
  // NEW Phase 3
  BIANXIE_API_KEY: string
  BIANXIE_BASE_URL: string
  AI_JWT_SECRET: string
}

export const SecretsSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_BASE_URL: z.string().url(),
  ALLOWED_EXTENSION_ORIGINS: z.string(),
  BIANXIE_API_KEY: z.string().min(10),
  BIANXIE_BASE_URL: z.string().url(),
  AI_JWT_SECRET: z.string().min(32),
})
```

`apps/api/wrangler.toml` 加（两个 env 都加）：

```toml
[vars]
...
BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"

[env.production.vars]
...
BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
```

Secrets:

```bash
# local .dev.vars
echo 'BIANXIE_API_KEY=<paste>' >> apps/api/.dev.vars
echo "AI_JWT_SECRET=$(openssl rand -base64 48)" >> apps/api/.dev.vars

# production (do NOT run yet — deploy at end of task)
# HTTP_PROXY="" pnpm --filter @getu/api exec wrangler secret put BIANXIE_API_KEY --env production
# HTTP_PROXY="" pnpm --filter @getu/api exec wrangler secret put AI_JWT_SECRET --env production
```

- [ ] **Step 2: JWT — 失败测试**

```ts
// apps/api/src/ai/__tests__/jwt.test.ts
import { describe, expect, it, vi } from "vitest"
import { signAiJwt, verifyAiJwt, AI_JWT_TTL_SECONDS } from "../jwt"

const SECRET = "a".repeat(48)

describe("aiJwt", () => {
  it("round-trips userId", async () => {
    const token = await signAiJwt({ userId: "u1", now: 1000 }, SECRET)
    const { userId, exp } = await verifyAiJwt(token, SECRET, 1000 + 60)
    expect(userId).toBe("u1")
    expect(exp).toBe(1000 + AI_JWT_TTL_SECONDS)
  })

  it("rejects expired token", async () => {
    const token = await signAiJwt({ userId: "u1", now: 1000 }, SECRET)
    await expect(verifyAiJwt(token, SECRET, 1000 + AI_JWT_TTL_SECONDS + 10)).rejects.toThrow()
  })

  it("rejects wrong secret", async () => {
    const token = await signAiJwt({ userId: "u1", now: 1000 }, SECRET)
    await expect(verifyAiJwt(token, "b".repeat(48), 1000 + 60)).rejects.toThrow()
  })
})
```

- [ ] **Step 3: 实装 `apps/api/src/ai/jwt.ts`**

```ts
import { sign, verify } from "hono/jwt"

export const AI_JWT_TTL_SECONDS = 15 * 60 // 15 minutes

export async function signAiJwt(
  input: { userId: string, now?: number },
  secret: string,
): Promise<string> {
  const iat = Math.floor((input.now ?? Date.now()) / 1000)
  return sign({ sub: input.userId, iat, exp: iat + AI_JWT_TTL_SECONDS }, secret)
}

export async function verifyAiJwt(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ userId: string, exp: number }> {
  const payload = await verify(token, secret) as { sub: string, exp: number }
  if (payload.exp < nowSeconds) throw new Error("JWT expired")
  return { userId: payload.sub, exp: payload.exp }
}
```

Verify: `pnpm --filter @getu/api test src/ai/__tests__/jwt.test.ts` → PASS.

- [ ] **Step 4: usage-parser — 失败测试**

```ts
// apps/api/src/ai/__tests__/usage-parser.test.ts
import { describe, expect, it } from "vitest"
import { extractUsageFromSSE } from "../usage-parser"

const SSE_WITH_USAGE = [
  `data: {"id":"cmpl-1","choices":[{"delta":{"content":"Hello"}}]}\n\n`,
  `data: {"id":"cmpl-1","choices":[{"delta":{"content":" world"}}]}\n\n`,
  `data: {"id":"cmpl-1","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n`,
  `data: [DONE]\n\n`,
].join("")

const SSE_WITHOUT_USAGE = [
  `data: {"id":"cmpl-1","choices":[{"delta":{"content":"Hi"}}]}\n\n`,
  `data: [DONE]\n\n`,
].join("")

describe("extractUsageFromSSE", () => {
  it("returns prompt + completion tokens", async () => {
    const stream = new Response(SSE_WITH_USAGE).body!
    const [tee, usageP] = extractUsageFromSSE(stream)
    // drain tee to trigger parsing
    const reader = tee.getReader()
    while (!(await reader.read()).done) { /* noop */ }
    expect(await usageP).toEqual({ input: 10, output: 20 })
  })

  it("falls back to null when usage missing", async () => {
    const stream = new Response(SSE_WITHOUT_USAGE).body!
    const [tee, usageP] = extractUsageFromSSE(stream)
    const reader = tee.getReader()
    while (!(await reader.read()).done) { /* noop */ }
    expect(await usageP).toBeNull()
  })
})
```

- [ ] **Step 5: 实装 `usage-parser.ts`**

```ts
/**
 * Tees an SSE response body into (pass-through stream, usage-extraction promise).
 * The usage promise resolves after the source stream closes.
 * Implementation: parses every `data: {...}` line; tracks the last one that has `usage.{prompt,completion}_tokens`.
 */
export function extractUsageFromSSE(
  source: ReadableStream<Uint8Array>,
): [ReadableStream<Uint8Array>, Promise<{ input: number, output: number } | null>] {
  const [a, b] = source.tee()
  const usageP = (async () => {
    const reader = b.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let found: { input: number, output: number } | null = null
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (payload === "[DONE]") continue
          try {
            const json = JSON.parse(payload) as { usage?: { prompt_tokens?: number, completion_tokens?: number } }
            const u = json.usage
            if (u && typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number") {
              found = { input: u.prompt_tokens, output: u.completion_tokens }
            }
          } catch { /* ignore non-JSON data lines */ }
        }
      }
    }
    return found
  })()
  return [a, usageP]
}
```

- [ ] **Step 6: Proxy — 失败测试**

```ts
// apps/api/src/ai/__tests__/proxy.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { handleChatCompletions } from "../proxy"

describe("handleChatCompletions", () => {
  beforeEach(() => vi.restoreAllMocks())

  function req(body: unknown, jwt = "Bearer valid") {
    return new Request("https://api.getutranslate.com/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: jwt, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  const env = {
    BIANXIE_API_KEY: "bx-key", BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
    AI_JWT_SECRET: "x".repeat(48), DB: {} as any,
  } as any

  it("401 when missing Bearer", async () => {
    const r = await handleChatCompletions(req({ model: "gpt-4o-mini", messages: [] }, ""), env, {} as any)
    expect(r.status).toBe(401)
  })

  it("400 when model not in whitelist", async () => {
    vi.mock("../jwt", () => ({ verifyAiJwt: vi.fn(async () => ({ userId: "u1", exp: 9e9 })) }))
    const r = await handleChatCompletions(req({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }), env, {} as any)
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body.error).toMatch(/whitelist/i)
  })

  it("forwards to bianxie with injected key and streams response", async () => {
    vi.mock("../jwt", () => ({ verifyAiJwt: vi.fn(async () => ({ userId: "u1", exp: 9e9 })) }))
    const fetchSpy = vi.fn(async () => new Response(`data: [DONE]\n\n`, {
      status: 200, headers: { "content-type": "text/event-stream" },
    }))
    vi.stubGlobal("fetch", fetchSpy)
    const r = await handleChatCompletions(req({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }), env, { waitUntil: () => {} } as any)
    expect(r.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.bianxie.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer bx-key" }),
      }),
    )
  })
})
```

- [ ] **Step 7: 实装 `proxy.ts`**

```ts
import { ORPCError } from "@orpc/server"
import { isProModel, normalizeTokens, type ProModel } from "@getu/contract"
import { createDb } from "@getu/db"
import { consumeQuota } from "../billing/quota"
import { verifyAiJwt } from "./jwt"
import { extractUsageFromSSE } from "./usage-parser"
import type { WorkerEnv } from "../env"

export async function handleChatCompletions(
  req: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  // 1. Auth
  const authHeader = req.headers.get("authorization") ?? ""
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!bearer) return json({ error: "missing bearer token" }, 401)
  let userId: string
  try {
    const v = await verifyAiJwt(bearer, env.AI_JWT_SECRET)
    userId = v.userId
  } catch {
    return json({ error: "invalid or expired token" }, 401)
  }

  // 2. Parse + validate model
  const body = await req.json().catch(() => null) as { model?: unknown, messages?: unknown, stream?: unknown } | null
  if (!body || typeof body.model !== "string") return json({ error: "missing model" }, 400)
  if (!isProModel(body.model)) {
    return json({ error: `model '${body.model}' not in Pro whitelist` }, 400)
  }
  const model: ProModel = body.model

  // 3. Forward to bianxie.ai
  const upstream = await fetch(`${env.BIANXIE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.BIANXIE_API_KEY}`,
      "content-type": "application/json",
    },
    // Ensure usage is included in streamed response
    body: JSON.stringify({ ...body, stream_options: { include_usage: true } }),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "")
    return json({ error: "upstream error", status: upstream.status, body: text }, 502)
  }

  // 4. Tee stream; async charge after completion
  const isStream = body.stream === true || upstream.headers.get("content-type")?.includes("text/event-stream")
  if (isStream) {
    const [forward, usageP] = extractUsageFromSSE(upstream.body)
    ctx.waitUntil(chargeAfterStream(env, userId, model, usageP, req.headers.get("x-request-id") ?? crypto.randomUUID()))
    return new Response(forward, { status: 200, headers: upstream.headers })
  }

  // Non-streaming branch (rare; log but still charge)
  const clone = upstream.clone()
  const text = await upstream.text()
  let parsed: { usage?: { prompt_tokens?: number, completion_tokens?: number } } = {}
  try { parsed = JSON.parse(text) } catch { /* ignore */ }
  const usage = parsed.usage?.prompt_tokens != null && parsed.usage?.completion_tokens != null
    ? { input: parsed.usage.prompt_tokens, output: parsed.usage.completion_tokens }
    : null
  ctx.waitUntil(chargeAfterStream(env, userId, model, Promise.resolve(usage), req.headers.get("x-request-id") ?? crypto.randomUUID()))
  return new Response(text, { status: 200, headers: clone.headers })
}

async function chargeAfterStream(
  env: WorkerEnv,
  userId: string,
  model: ProModel,
  usageP: Promise<{ input: number, output: number } | null>,
  requestId: string,
) {
  try {
    const usage = await usageP
    const units = usage == null ? 1 : normalizeTokens(model, usage)
    if (units < 1) return
    const db = createDb(env.DB)
    await consumeQuota(db, userId, "ai_translate_monthly", units, requestId)
  } catch (err) {
    console.warn("[ai-proxy] charge failed", { userId, model, err: String(err) })
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  })
}
```

- [ ] **Step 8: 在 `apps/api/src/index.ts` 挂路由**

```ts
import { handleChatCompletions } from "./ai/proxy"
import { signAiJwt } from "./ai/jwt"

// After existing app.all("/orpc/*", ...) block, add:

app.use("/ai/*", async (c, next) => makeCorsMw(c.env)(c, next))

app.post("/ai/v1/token", async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null)
  if (!session?.user) return c.json({ error: "unauthorized" }, 401)
  const token = await signAiJwt({ userId: session.user.id }, c.env.AI_JWT_SECRET)
  return c.json({ token, expires_in: 15 * 60 })
})

app.post("/ai/v1/chat/completions", async (c) => {
  return handleChatCompletions(c.req.raw, c.env, c.executionCtx)
})
```

- [ ] **Step 9: 本地 e2e 冒烟（重要 — bianxie.ai 的真实调用）**

```bash
pnpm --filter @getu/api dev &
sleep 6

# 1. Sign up + grant Pro
pnpm --filter @getu/api exec tsx scripts/grant-pro.ts --email=me@example.com --env=local

# 2. Get JWT (with session cookie from login)
curl -s -X POST http://localhost:8788/ai/v1/token \
  --cookie 'better-auth.session_token=<paste>' | tee /tmp/jwt.json

# 3. Call chat completions (streaming)
curl -N -X POST http://localhost:8788/ai/v1/chat/completions \
  -H "authorization: Bearer $(jq -r .token /tmp/jwt.json)" \
  -H "content-type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Say hi in 3 words"}],"stream":true}'
# Expected: SSE stream with actual LLM response

# 4. Check D1 for usage_log + quota_period increment
HTTP_PROXY="" pnpm --filter @getu/api exec wrangler d1 execute getu-translate --local \
  --command="SELECT bucket, amount, upstream_model FROM usage_log ORDER BY created_at DESC LIMIT 5"
# Expected: at least 1 row with bucket=ai_translate_monthly

kill %1
```

- [ ] **Step 10: Commit + PR**

```bash
git switch -c feat/phase3-task-4-ai-proxy
git add apps/api
git commit -m "feat(api): AI proxy to bianxie.ai with JWT auth and async quota charging"
gh pr create --base main --title "feat(api): AI proxy (bianxie.ai passthrough + quota)"
```

---

## Task 5: Rate limit

**Files:**
- Modify: `apps/api/src/ai/proxy.ts` (insert rate-limit check)
- Create: `apps/api/src/ai/rate-limit.ts`
- Create: `apps/api/src/ai/__tests__/rate-limit.test.ts`

**Approach:** Phase 3 用 D1-based 滑动窗口（简单版），Phase 4 视负载考虑 Durable Object。契约写 300/min/user。

- [ ] **Step 1: schema** — 加一张 `rate_limit_bucket` 表到 `packages/db`？**不加。** YAGNI：用 `usage_log` 现成的 `(user_id, created_at)` 索引按 bucket='ai_rate_limit' 记即可，定期让 quota_period cleanup cron 清（Phase 4）。

- [ ] **Step 2: 失败测试**

```ts
// apps/api/src/ai/__tests__/rate-limit.test.ts
describe("checkRateLimit", () => {
  it("allows up to N requests in window", async () => { /* ... */ })
  it("blocks N+1", async () => { /* ... */ })
  it("recovers after window slides", async () => { /* ... */ })
})
```

- [ ] **Step 3: 实装 `rate-limit.ts`**

使用 `usageLog` 表 `bucket='ai_rate_limit'` 记录每次请求（amount=1），窗口 60s 内 count(*) 超过 300 则拒绝。注意：**不能调 `consumeQuota`**（它有幂等索引，每次请求 request_id 不同也行但会加写 quota_period — 用独立 SELECT count 避免污染）。

- [ ] **Step 4: 插入 proxy.ts**

在 Task 4 的 `handleChatCompletions` 中 auth 成功后、parse 前插入：

```ts
if (!(await checkRateLimit(env.DB, userId))) {
  return json({ error: "rate limit exceeded: 300 req/min" }, 429)
}
```

- [ ] **Step 5: Commit + PR**

```bash
git commit -m "feat(api): per-user rate limit on AI proxy (300 req/min)"
```

---

## Task 6: 扩展端 — GetU Pro 虚拟 provider + Pro gate UI

**Files:**
- Create: `apps/extension/src/utils/ai/getu-pro-jwt.ts`
- Create: `apps/extension/src/utils/ai/__tests__/getu-pro-jwt.test.ts`
- Modify: `apps/extension/src/utils/constants/models.ts`
- Modify: `apps/extension/src/utils/constants/providers.ts`
- Modify: `apps/extension/src/types/config/provider.ts`
- Modify: `apps/extension/src/utils/providers/model.ts`
- Modify: `apps/extension/src/utils/atoms/provider.ts` (or similar) — filter out `getu-pro` when not Pro
- Modify: `apps/extension/src/entrypoints/options/pages/api-providers/providers-config.tsx`
- Modify: `apps/extension/src/utils/config/migration-scripts/` (new migration registering `getu-pro`)

**Key design:**
- 新增 provider type `"getu-pro"`。它在 schema 上是 `openai-compatible` 的一个变种：baseURL 硬编码 `${WEBSITE_URL_API}/ai/v1`（从 `@getu/definitions`），apiKey 由 `getu-pro-jwt.ts` 异步注入
- Model whitelist: 复用 `PRO_MODEL_WHITELIST` from `@getu/contract`（Task 0 已导出）
- JWT 维护：`getu-pro-jwt.ts` 暴露 `getProJwt(): Promise<string>` — 内存缓存 + 14min 过期刷新 + `/ai/v1/token` 调用（带 session cookie，走 extension 的 `backgroundFetch` 代理）
- Pro gate：`providers-config.tsx` 的渲染列表里 filter 掉 `getu-pro` 当 `useEntitlements().data.tier !== 'pro'`

- [ ] **Step 1: `getu-pro-jwt.ts` 失败测试 + 实装**

```ts
// apps/extension/src/utils/ai/getu-pro-jwt.ts
import { WEBSITE_URL } from "@/utils/constants/url"

interface CachedJwt { token: string, expiresAt: number }
let cache: CachedJwt | null = null

export async function getProJwt(opts?: { force?: boolean }): Promise<string> {
  if (!opts?.force && cache && cache.expiresAt > Date.now() + 30_000) return cache.token
  const apiBase = WEBSITE_URL.replace(/^https?:\/\/(?:www\.)?/, "https://api.") + "/ai/v1/token"
  // NOTE: rely on extension backgroundFetch proxy so session cookie attaches
  const res = await fetch(apiBase, { method: "POST", credentials: "include" })
  if (!res.ok) throw new Error(`Pro JWT fetch failed: ${res.status}`)
  const body = await res.json() as { token: string, expires_in: number }
  cache = { token: body.token, expiresAt: Date.now() + body.expires_in * 1000 }
  return cache.token
}

export function __clearJwtCache() { cache = null } // test helper
```

Test: mock fetch, assert cache hit/miss, expiry behavior.

- [ ] **Step 2: 常量** — `apps/extension/src/utils/constants/models.ts`

在 `LLM_PROVIDER_MODELS` 对象里加：

```ts
"getu-pro": ["gpt-4o-mini", "claude-3-5-sonnet-latest", "gemini-2.0-flash"],
```

Add `"getu-pro"` to LLM arrays where relevant. Also add to `DEFAULT_LLM_PROVIDER_MODELS` in `providers.ts`:

```ts
"getu-pro": {
  model: "gpt-4o-mini",
  isCustomModel: false,
  customModel: null,
},
```

- [ ] **Step 3: `PROVIDER_ITEMS` + `DEFAULT_PROVIDER_CONFIG`**

```ts
"getu-pro": {
  logo: () => customProviderLogo, // or a new getu logo
  name: "GetU Translate Pro",
  website: `${WEBSITE_URL}/pricing`,
},
// ...
"getu-pro": {
  id: "getu-pro-default",
  name: PROVIDER_ITEMS["getu-pro"].name,
  description: i18n.t("options.apiProviders.providers.description.getuPro"),
  enabled: true,
  provider: "getu-pro",
  model: DEFAULT_LLM_PROVIDER_MODELS["getu-pro"],
},
```

Add to `DEFAULT_PROVIDER_CONFIG_LIST` **at the top** so Pro users see it first.

- [ ] **Step 4: 类型 enums** — `apps/extension/src/types/config/provider.ts`

把 `"getu-pro"` 加到以下数组：
- `TRANSLATE_PROVIDER_TYPES`
- `LLM_PROVIDER_TYPES`
- `NON_CUSTOM_LLM_PROVIDER_TYPES`（因为不是 openai-compatible 变种；虽然底层是，但对用户不暴露 baseURL/apiKey）
- `API_PROVIDER_TYPES`
- `ALL_PROVIDER_TYPES`

加 schema 条目：

```ts
baseAPIProviderConfigSchema.extend({
  provider: z.literal("getu-pro"),
  model: createProviderModelSchema<"getu-pro">("getu-pro"),
}),
```

- [ ] **Step 5: `CREATE_AI_MAPPER`** — `apps/extension/src/utils/providers/model.ts`

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { getProJwt } from "@/utils/ai/getu-pro-jwt"
import { WEBSITE_URL } from "@/utils/constants/url"

const CREATE_AI_MAPPER = {
  // ... existing
  "getu-pro": createOpenAICompatible,
} as const

// In getLanguageModelById, special-case "getu-pro" before the generic branch:
if (providerConfig.provider === "getu-pro") {
  const apiKey = await getProJwt()
  const baseURL = WEBSITE_URL.replace(/^https?:\/\/(?:www\.)?/, "https://api.") + "/ai/v1"
  const provider = createOpenAICompatible({
    name: "getu-pro",
    baseURL,
    apiKey,
    supportsStructuredOutputs: true,
  })
  const modelId = resolveModelId(providerConfig.model)
  if (!modelId) throw new Error("Model is undefined")
  return provider.languageModel(modelId)
}
```

- [ ] **Step 6: 配置 migration**

Bump config schema version; add a migration script that inserts `DEFAULT_PROVIDER_CONFIG["getu-pro"]` at position 0 if not present (so existing users get the new option automatically).

Follow existing pattern in `apps/extension/src/utils/config/migration-scripts/`. See [`migration-scripts`](../../apps/extension/src/utils/config/migration-scripts/) skill if available.

- [ ] **Step 7: Options 页 Pro gate**

In `apps/extension/src/entrypoints/options/pages/api-providers/providers-config.tsx` (or wherever the provider list renders), filter:

```tsx
const { data: ent } = useEntitlements(userId)
const visible = providers.filter(p => p.provider !== "getu-pro" || ent.tier !== "free")
```

For Pro users, also hide the apiKey / baseURL edit inputs on this provider's config form — add a branch in `provider-config-form/` that renders a read-only "Powered by your Pro subscription" banner instead.

- [ ] **Step 8: 集成测试 + 手动 e2e**

Run `pnpm --filter @getu/extension test` + `pnpm --filter @getu/extension build`.

Manual smoke:
1. `wrangler dev` + `wrangler pages dev apps/web/out` + `pnpm --filter @getu/extension dev`
2. Sign up in the web app; `grant-pro.ts --env=local --email=me@example.com`
3. Open extension options → API Providers → "GetU Translate Pro" visible, default model = gpt-4o-mini
4. Trigger a page translation → confirm `GET /ai/v1/token` (200) + `POST /ai/v1/chat/completions` (200, streaming) in bg DevTools network
5. In D1 local: `SELECT bucket, amount, upstream_model FROM usage_log` → see at least one row, `amount > 0`
6. Call `/orpc/billing/getEntitlements` → response contains valid quota remaining (needs Task 2 extension: getEntitlements should also populate `quota` by summing `quota_period`)

- [ ] **Step 9: Commit + PR**

```bash
git switch -c feat/phase3-task-6-extension-pro-provider
git commit -m "feat(extension): add GetU Translate Pro virtual provider with JWT auth"
gh pr create --base main --title "feat(extension): GetU Pro virtual provider + Pro gate"
```

---

## Phase 3 Acceptance Criteria

- [ ] 6 PRs merged (Tasks 0–5) + 1 extension PR (Task 6)
- [ ] `pnpm -r type-check && pnpm -r test` all green
- [ ] `pnpm --filter @getu/extension build` green; extension loads with no console errors
- [ ] Production `https://api.getutranslate.com/ai/v1/token` returns JWT for signed-in Pro user
- [ ] Production `https://api.getutranslate.com/ai/v1/chat/completions` with valid JWT and whitelisted model streams real LLM output
- [ ] Pro user's 100k monthly unit limit enforced — after exceeding, 429 with QUOTA_EXCEEDED
- [ ] Free user's call to `consumeQuota(ai_translate_monthly, ...)` returns 403 FORBIDDEN
- [ ] Same `request_id` replayed → second call returns identical response, no double-charge
- [ ] `grant-pro.ts` works against production D1 (confirmed by real signed-up test user)
- [ ] [#60](https://github.com/getutranslate/getu-translate/issues/60) closed; `fetch-entitlements.ts` has no `as any`

---

## Risk Register

| Risk | Mitigation |
|---|---|
| bianxie.ai outage → Pro users dead in water | No fallback in Phase 3 — return 503. Log Sentry-equivalent errors. Phase 4 evaluates hot-standby (e.g., direct OpenAI key + routing). |
| bianxie.ai pricing model changes, coefficients become wrong | `AI_MODEL_COEFFICIENTS` centralized in `@getu/contract/ai-models.ts`. Review quarterly; bump when bianxie adjusts. Usage is logged with raw input/output tokens — can re-bill retroactively if needed. |
| SSE usage field missing from upstream response | `chargeAfterStream` falls back to `units=1` and logs WARN. Measure incidence in first week — if >5%, open issue to tee request body and estimate tokens via tiktoken instead. |
| D1 `db.batch` semantics differ from expectation | Task 3 Step 8 local integration smoke catches it. If production behavior differs, switch to explicit `BEGIN/COMMIT` via `db.run(sql\`BEGIN\`)`. |
| Worker subrequest cap (Free plan 50) hit on PDF-heavy sessions | Pro gated — only logged-in Pro users hit proxy. PDF translates in batches of ~5 requests typical. If metrics show >50 in one session, upgrade to Paid Workers. |
| JWT leak from compromised client | TTL = 15min + Bearer-only validates on every request. `AI_JWT_SECRET` rotatable via `wrangler secret put`; old JWTs die within 15min. |
| Extension `getu-pro` provider config schema migration fails for existing users | Migration is additive (inserts new entry); rollback = `git revert` + bump schema version to prior. Test migration with fixture configs from `migration-scripts/__tests__/`. |
| bianxie.ai returns non-OpenAI-compat schema for Claude/Gemini models | Validate assumption in Task 4 Step 9: actually call all 3 whitelist models with `stream: true` and confirm SSE shape matches. If one differs, **remove it from whitelist** rather than add per-model parser (P1 decision stands). |
| Free user crafts curl with JWT from Pro account (shared credential abuse) | Out of scope for Phase 3 — session is tied to better-auth cookie, JWT is single-use short-lived. Phase 4 adds device fingerprinting if abuse signals. |

---

## Execution Handoff

Plan saved. Two options to proceed:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, Claude (always) + Codex (for Tasks 1/3/4/6) review between tasks, CI-gated merges. Same pattern as Phase 2.

**2. Parallel Session** — Open a new session in a Task-specific worktree and run `superpowers:executing-plans` against this file. Useful if batching multiple tasks on one branch makes sense (it doesn't here — each Task is independently shippable).

**Recommend (1).** Codex matrix per [`feedback_codex_review_scope.md`](../agents/memory/feedback_codex_review_scope.md):
- **Codex review:** Task 1 (schema — DB shape is load-bearing), Task 3 (atomic/idempotent core), Task 4 (real proxy logic + stream handling), Task 6 (extension schema migration + provider mapper changes)
- **Claude reviewer only:** Task 0 (contract — mostly declarative), Task 2 (thin wrapper + script), Task 5 (small helper)

Waiting for your signal to create the 7 Phase 3 issues and start Task 0.
