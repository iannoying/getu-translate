# M0 · 商业化基础设施 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent roadmap:** `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md`
> **Workflow:** 每个 Task 对应一个 GitHub Issue + 独立 feature branch + PR。

**Goal:** 为所有付费功能铺设基础：entitlements 契约、feature flag、paywall 组件、后端联调规范。完成后任意业务功能只需 `if (!entitlement.canUse("x")) showUpgrade()` 即可接入商业化。

**Architecture:**

- 复用已就绪的 `better-auth` + `oRPC` + `PostHog` 三件套
- 后端（独立 repo）新增 `billing.*` oRPC 路由，本 repo 消费它
- Entitlements 双写：oRPC 实时查询 + Dexie 离线缓存（断网降级）
- Feature flag 走 PostHog 标准 API（需打开 `advanced_disable_flags: false`）
- Paywall UI 是复用组件，不是一次性弹窗

**Tech Stack:** oRPC / Jotai / Dexie / better-auth / PostHog / shadcn

**Out of scope（后端仓做）：** Stripe Webhook、订阅生命周期、配额扣减服务端逻辑、价格表配置。本 plan 只产出**契约 spec** 交给后端。

---

## 已有基础设施（不要重复造轮子）

| 已有                               | 文件                                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| better-auth React client           | `src/utils/auth/auth-client.ts` — `authClient`                 |
| oRPC client + tanstack-query utils | `src/utils/orpc/client.ts` — `orpcClient`, `orpc`              |
| Background fetch proxy             | `src/utils/message.ts` — `sendMessage("backgroundFetch", ...)` |
| PostHog analytics                  | `src/entrypoints/background/analytics.ts`                      |
| Dexie app DB                       | `src/utils/db/dexie/app-db.ts`                                 |
| Jotai atoms                        | `src/utils/atoms/`                                             |
| shadcn Dialog/Button               | `src/components/ui/`                                           |

---

## Task 清单总览（8 个 Task / 8 个 Issue / 8 个 PR）

| #   | Task                                         | 输出                                 | 预计 |
| --- | -------------------------------------------- | ------------------------------------ | ---- |
| 1   | Entitlements 契约类型定义                    | `types/entitlements.ts` + zod schema | 0.5d |
| 2   | Dexie `entitlements_cache` 表 + migration    | 新表 + 读写 helper                   | 0.5d |
| 3   | `useEntitlements` hook + 离线降级            | Jotai atom + hook                    | 1d   |
| 4   | PostHog Feature Flag 打开 + `useFeatureFlag` | 放开 flags + hook                    | 0.5d |
| 5   | `<ProGate>` / `<UpgradeDialog>` 组件         | 可复用 paywall 基元                  | 1d   |
| 6   | Options 页"账户与订阅"区块                   | 登录态 + 订阅状态 + 升级入口         | 1d   |
| 7   | i18n 文案                                    | 中英 key                             | 0.5d |
| 8   | 后端契约 spec 文档                           | `docs/contracts/billing.md` 交给后端 | 1d   |

总计约 **6 个工作日**，但加上 PR review + 等后端联调，现实 2 周。

---

## Task 1: Entitlements 契约类型定义

**Files:**

- Create: `src/types/entitlements.ts`
- Create: `src/types/__tests__/entitlements.test.ts`

**Step 1: 写失败测试**

```ts
// src/types/__tests__/entitlements.test.ts
import { describe, expect, it } from 'vitest'
import { EntitlementsSchema, hasFeature, isPro } from '../entitlements'

describe('EntitlementsSchema', () => {
  it('validates a free user', () => {
    const free = { tier: 'free', features: [], quota: {}, expiresAt: null }
    expect(() => EntitlementsSchema.parse(free)).not.toThrow()
  })

  it('validates a pro user with expiry', () => {
    const pro = {
      tier: 'pro',
      features: ['pdf_translate', 'input_translate_unlimited'],
      quota: { ai_translate_monthly: { used: 1200, limit: 50000 } },
      expiresAt: '2027-01-01T00:00:00.000Z',
    }
    expect(() => EntitlementsSchema.parse(pro)).not.toThrow()
  })

  it('rejects invalid tier', () => {
    expect(() => EntitlementsSchema.parse({ tier: 'gold', features: [], quota: {}, expiresAt: null })).toThrow()
  })
})

describe('hasFeature', () => {
  it('returns true when feature is in list', () => {
    const e = { tier: 'pro' as const, features: ['pdf_translate'], quota: {}, expiresAt: null }
    expect(hasFeature(e, 'pdf_translate')).toBe(true)
  })
  it('returns false when feature missing', () => {
    const e = { tier: 'free' as const, features: [], quota: {}, expiresAt: null }
    expect(hasFeature(e, 'pdf_translate')).toBe(false)
  })
})

describe('isPro', () => {
  it('true for active pro', () => {
    const e = { tier: 'pro' as const, features: [], quota: {}, expiresAt: new Date(Date.now() + 86400_000).toISOString() }
    expect(isPro(e)).toBe(true)
  })
  it('false for expired pro', () => {
    const e = { tier: 'pro' as const, features: [], quota: {}, expiresAt: new Date(Date.now() - 86400_000).toISOString() }
    expect(isPro(e)).toBe(false)
  })
})
```

**Step 2: 验证失败**

Run: `SKIP_FREE_API=true pnpm test src/types/__tests__/entitlements.test.ts`
Expected: FAIL, "Cannot find module '../entitlements'"

**Step 3: 最小实现**

```ts
// src/types/entitlements.ts
import { z } from 'zod'

export const FeatureKey = z.enum([
  'pdf_translate',
  'input_translate_unlimited',
  'vocab_unlimited',
  'vocab_cloud_sync',
  'ai_translate_pool',
  'subtitle_platforms_extended',
  'enterprise_glossary_share',
])
export type FeatureKey = z.infer<typeof FeatureKey>

export const QuotaBucketSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
})

export const EntitlementsSchema = z.object({
  tier: z.enum(['free', 'pro', 'enterprise']),
  features: z.array(FeatureKey),
  quota: z.record(z.string(), QuotaBucketSchema),
  expiresAt: z.string().datetime().nullable(),
})
export type Entitlements = z.infer<typeof EntitlementsSchema>

export function hasFeature(e: Entitlements, f: FeatureKey): boolean {
  return e.features.includes(f)
}

export function isPro(e: Entitlements): boolean {
  if (e.tier === 'free')
    return false
  if (e.expiresAt == null)
    return e.tier === 'enterprise'
  return Date.parse(e.expiresAt) > Date.now()
}

export const FREE_ENTITLEMENTS: Entitlements = {
  tier: 'free',
  features: [],
  quota: {},
  expiresAt: null,
}
```

**Step 4: 测试通过**

Run: `SKIP_FREE_API=true pnpm test src/types/__tests__/entitlements.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/types/entitlements.ts src/types/__tests__/entitlements.test.ts
git commit -m "feat(types): add entitlements schema and predicates"
```

---

## Task 2: Dexie `entitlements_cache` 表 + migration

**Files:**

- Create: `src/utils/db/dexie/tables/entitlements-cache.ts`
- Modify: `src/utils/db/dexie/app-db.ts`（注册新表，bump version）
- Create: `src/utils/db/dexie/tables/__tests__/entitlements-cache.test.ts`

**Step 1: 先读 `app-db.ts` 了解当前 version 和 table 声明模式**

用 Read 工具查看 `src/utils/db/dexie/app-db.ts`；参考已有 `batch-request-record.ts` 表实现。

**Step 2: 写失败测试**

```ts
// src/utils/db/dexie/tables/__tests__/entitlements-cache.test.ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { appDb } from '@/utils/db/dexie/app-db'
import { readCachedEntitlements, writeCachedEntitlements } from '../entitlements-cache'

describe('entitlements-cache', () => {
  beforeEach(async () => { await appDb.entitlementsCache.clear() })

  it('writes and reads back entitlements by userId', async () => {
    const e = { tier: 'pro' as const, features: ['pdf_translate' as const], quota: {}, expiresAt: '2099-01-01T00:00:00.000Z' }
    await writeCachedEntitlements('user-1', e)
    const got = await readCachedEntitlements('user-1')
    expect(got?.value).toEqual(e)
  })

  it('returns null when userId absent', async () => {
    expect(await readCachedEntitlements('missing')).toBeNull()
  })
})
```

（如果 `fake-indexeddb` 未装，改为 mock `appDb` 的 table；参考已有表测试。）

**Step 3: 验证失败** → **Step 4: 实现** → **Step 5: 测试通过** → **Step 6: Commit**

```bash
git commit -m "feat(db): add entitlements_cache Dexie table"
```

---

## Task 3: `useEntitlements` hook + 离线降级

**Files:**

- Create: `src/utils/atoms/entitlements.ts`
- Create: `src/hooks/use-entitlements.ts`
- Create: `src/hooks/__tests__/use-entitlements.test.tsx`

**行为契约**：

1. 优先读取 oRPC `billing.getEntitlements` 返回值 → 写入 atom + Dexie
2. 网络失败或未登录 → 读 Dexie 缓存
3. 两者都无 → 返回 `FREE_ENTITLEMENTS`
4. session 变化（登录/登出）→ 自动重查

**Step 1: 写失败测试（React Testing Library）**

```tsx
// src/hooks/__tests__/use-entitlements.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEntitlements } from '../use-entitlements'

vi.mock('@/utils/orpc/client', () => ({
  orpcClient: { billing: { getEntitlements: vi.fn() } },
}))

describe('useEntitlements', () => {
  it('returns FREE when user not signed in', async () => {
    const { result } = renderHook(() => useEntitlements({ userId: null }))
    await waitFor(() => expect(result.current.data?.tier).toBe('free'))
  })

  it('returns pro entitlements from orpc on success', async () => {
    const { orpcClient } = await import('@/utils/orpc/client')
    ;(orpcClient.billing.getEntitlements as any).mockResolvedValue({
      tier: 'pro', features: ['pdf_translate'], quota: {}, expiresAt: '2099-01-01T00:00:00.000Z',
    })
    const { result } = renderHook(() => useEntitlements({ userId: 'user-1' }))
    await waitFor(() => expect(result.current.data?.tier).toBe('pro'))
  })

  it('falls back to Dexie cache on network error', async () => {
    const { orpcClient } = await import('@/utils/orpc/client')
    ;(orpcClient.billing.getEntitlements as any).mockRejectedValue(new Error('offline'))
    // seed cache first (via the module under test or direct writeCachedEntitlements)
    // ...
    const { result } = renderHook(() => useEntitlements({ userId: 'user-1' }))
    await waitFor(() => expect(result.current.data?.tier).toBe('pro'))
  })
})
```

**Step 2-5:** 失败验证 → 实现（Jotai atom + tanstack-query `useQuery` 包装 orpc 调用 + Dexie fallback）→ 通过 → Commit

```bash
git commit -m "feat(hooks): add useEntitlements with offline fallback"
```

---

## Task 4: PostHog Feature Flag 打开 + `useFeatureFlag`

**当前状态**：`analytics.ts` 第 169 行 `advanced_disable_flags: true` 明确关闭了 flags。

**Files:**

- Modify: `src/entrypoints/background/analytics.ts:169`（改为 `false`）
- Create: `src/utils/message.ts` 新增 `getFeatureFlag` 消息类型（content/popup 需通过 background 查询）
- Create: `src/hooks/use-feature-flag.ts`
- Create: `src/hooks/__tests__/use-feature-flag.test.tsx`

**风险**：打开 flags 会让 PostHog SDK 额外拉取 flag 定义，影响 background 启动时间。`createBackgroundAnalytics` 里测试好 `advanced_disable_flags: false` 不破坏既有 analytics 测试。

**Step 1-5:** 标准 TDD 循环

**Commit:**

```bash
git commit -m "feat(analytics): enable PostHog feature flags and expose useFeatureFlag"
```

---

## Task 5: `<ProGate>` / `<UpgradeDialog>` 组件

**Files:**

- Create: `src/components/billing/pro-gate.tsx`
- Create: `src/components/billing/upgrade-dialog.tsx`
- Create: `src/components/billing/__tests__/pro-gate.test.tsx`

**API 设计**：

```tsx
<ProGate feature="pdf_translate" fallback={<UpgradeDialog trigger="pdf" />}>
  <PdfTranslateButton />
</ProGate>
```

或者命令式：

```ts
const { guard } = useProGuard()
function handleClick() {
  if (!guard('pdf_translate', { trigger: 'pdf' }))
    return
  doPdfTranslate()
}
```

**Step 1: 写失败测试**

```tsx
// src/components/billing/__tests__/pro-gate.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProGate } from '../pro-gate'

vi.mock('@/hooks/use-entitlements', () => ({
  useEntitlements: vi.fn(),
}))

describe('<ProGate>', () => {
  it('renders children when feature granted', async () => {
    const { useEntitlements } = await import('@/hooks/use-entitlements')
    ;(useEntitlements as any).mockReturnValue({ data: { tier: 'pro', features: ['pdf_translate'], quota: {}, expiresAt: null } })
    render(<ProGate feature="pdf_translate" fallback={<span>upgrade</span>}><span>content</span></ProGate>)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('renders fallback when feature missing', async () => {
    const { useEntitlements } = await import('@/hooks/use-entitlements')
    ;(useEntitlements as any).mockReturnValue({ data: { tier: 'free', features: [], quota: {}, expiresAt: null } })
    render(<ProGate feature="pdf_translate" fallback={<span>upgrade</span>}><span>content</span></ProGate>)
    expect(screen.getByText('upgrade')).toBeInTheDocument()
  })
})
```

**Step 2-5:** 实现 + Commit

```bash
git commit -m "feat(billing): add ProGate and UpgradeDialog components"
```

---

## Task 6: Options 页"账户与订阅"区块

**Files:**

- Create: `src/entrypoints/options/routes/account.tsx`（复用 existing options routing）
- Modify: options 侧边栏导航加入"账户"入口

**UI 内容**：

- 未登录：展示"登录后享受云同步 / Pro 额度"按钮 → 跳转 `${WEBSITE_URL}/login`
- 已登录 Free：展示 `tier: Free` + "升级到 Pro" 按钮 → 跳转 `${WEBSITE_URL}/pricing`
- Pro：tier + expiresAt + 配额进度条 + "管理订阅"（跳 Stripe Customer Portal）

本 Task **不做 Stripe 集成**，只跳转到 Web 站点（Web 站点的 pricing/portal 由后端团队维护）。

**Commit:**

```bash
git commit -m "feat(options): add account and subscription section"
```

---

## Task 7: i18n 文案

**Files:**

- Modify: `src/locales/en.json` / `src/locales/zh-CN.json`（和其他已有语种）

新增 key：

```
billing.tier.free / tier.pro / tier.enterprise
billing.upgrade.cta / upgrade.title / upgrade.description
billing.quota.remaining / quota.exhausted
billing.expiry.active / expiry.expired
billing.account.signIn / signOut / managePlan
```

所有 `<ProGate fallback>` 和 `<UpgradeDialog>` 使用 `@wxt-dev/i18n` 的 `t()`。

**Commit:**

```bash
git commit -m "feat(i18n): add billing and paywall copy"
```

---

## Task 8: 后端契约 spec

**Files:**

- Create: `docs/contracts/billing.md`

**不是代码**，是交付给后端 repo（`read-frog-monorepo` / `@read-frog/api-contract`）的规范。内容：

```md
# billing 契约 (v1)

## Procedures

### billing.getEntitlements
- Auth: required (better-auth session)
- Input: `{}`
- Output: `Entitlements`（schema 见 extension repo `src/types/entitlements.ts`）
- Caching: `Cache-Control: private, max-age=30`
- Errors: `UNAUTHENTICATED` → 401

### billing.consumeQuota
- Auth: required
- Input: `{ bucket: string, amount: number }`
- Output: `{ remaining: number, reset_at: string }`
- Errors: `QUOTA_EXCEEDED` → 402

### billing.createCheckoutSession
- Auth: required
- Input: `{ plan: 'pro_monthly' | 'pro_yearly', successUrl: string, cancelUrl: string }`
- Output: `{ url: string }`（Stripe Checkout URL）

### billing.createPortalSession
- Auth: required
- Input: `{}`
- Output: `{ url: string }`

## Stripe Webhook（后端内部）
- `customer.subscription.created` / `.updated` / `.deleted` → 更新 `user_entitlements` 表
- `invoice.payment_failed` → 保留 Pro 7 天宽限期
- 所有 webhook 处理必须幂等（dedup by `event.id`）
```

**Commit:**

```bash
git add docs/contracts/billing.md
git commit -m "docs(contracts): spec billing oRPC procedures for backend"
```

---

## M0 验收标准

- [ ] 8 个 PR 全部 merge 到 `main`
- [ ] `SKIP_FREE_API=true pnpm test` 绿，新增测试 ≥ 15
- [ ] `pnpm type-check && pnpm lint` 无错
- [ ] 本地 `pnpm dev`：
  - Options 页"账户"能看到登录态
  - 登录 Free 账号能看到"升级"入口
  - 任意 Pro 功能（暂无真实功能时用 demo 页面）能正确 gate
- [ ] `docs/contracts/billing.md` 已提交给后端，后端完成 `billing.*` 实装
- [ ] Changeset 记录：`feat: commercialization infrastructure (M0)`

---

## 依赖图

```
Task 1 (types) ────────┐
                       ├──▶ Task 3 (hook)
Task 2 (db table) ─────┘        │
                                ├──▶ Task 5 (ProGate)
Task 4 (flags) ─────────────────┤        │
                                │        ├──▶ Task 6 (Options UI)
                                └────────┘
Task 7 (i18n) ────── 并行
Task 8 (contract doc) ── 立即开写，阻塞后端
```

**串行做或 stack PR**：Task 3 依赖 1+2，Task 5 依赖 3，Task 6 依赖 5。

**可并行**：Task 4、7、8 独立，任何时候都能开。

**Task 8 优先**：越早交付后端契约，后端越早开工，越能压缩 M0 实际时长。

---

## 下一步

Issues 草稿见同目录 `2026-04-20-m0-issues.md`。检查后可直接 `gh issue create` 批量建。
