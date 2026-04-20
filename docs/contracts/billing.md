# `billing.*` oRPC 契约 (v1)

> **Audience:** Read Frog 后端团队（`read-frog-monorepo` / `@read-frog/api-contract`）
> **Consumer:** 浏览器扩展仓 `mengxi-ream/read-frog`（本文件所在仓的 fork）
> **Status:** Draft — 实施前以本文档为准；实施过程中若发现不合理，以 PR 修订本文件为准。
> **Owner (extension side):** @iannoying / 本文档随 M0 PR 合入
> **Last updated:** 2026-04-20

---

## 1. 设计目标

1. **扩展端无状态**：所有订阅/配额状态以后端为准，扩展只做 30s-ish 本地缓存 + 离线降级。
2. **失败安全**：任何 billing 接口故障必须降级到 **Free tier**，不允许"降级到 Pro"。
3. **幂等**：`consumeQuota` 因网络重试可能被调用多次 —— 支持 `request_id` 幂等键。
4. **可观测**：所有 billing 接口接入后端标准日志 + PostHog `billing_*` 事件。

---

## 2. 认证与会话

- 所有 `billing.*` 接口 **要求已登录**（better-auth session cookie）。
- 扩展端通过 `src/utils/auth/auth-client.ts` 的 `authClient` 维护 session；所有 oRPC 请求带 `credentials: "include"` + `x-orpc-source: extension` header（见 `src/utils/orpc/client.ts:9-14`）。
- 未登录调用任意 `billing.*` → 后端返回 oRPC 错误码 `UNAUTHORIZED` (HTTP 401)。扩展端应 catch 并回退到 `FREE_ENTITLEMENTS`。

---

## 3. 数据模型

### 3.1 `Entitlements`

与扩展仓 `src/types/entitlements.ts` 中的 `EntitlementsSchema` **逐字节一致**。后端序列化时必须产出与下面 zod schema 能 parse 的 JSON。

```ts
const FeatureKey = z.enum([
  'pdf_translate',                  // PDF 双语翻译 + 下载
  'input_translate_unlimited',      // 输入框翻译无限次
  'vocab_unlimited',                // 生词本无限条
  'vocab_cloud_sync',               // 生词本云同步
  'ai_translate_pool',              // 共享 AI 翻译配额池（OpenAI/Claude 走后端 key）
  'subtitle_platforms_extended',    // Netflix/B站/X 等非 YouTube 字幕
  'enterprise_glossary_share',      // 企业版共享术语表
])

const QuotaBucketSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
})

const EntitlementsSchema = z.object({
  tier: z.enum(['free', 'pro', 'enterprise']),
  features: z.array(FeatureKey),
  quota: z.record(z.string(), QuotaBucketSchema),
  expiresAt: z.string().datetime().nullable(),
})
```

**字段约定：**

- `tier`：订阅层。`free` 始终可用；`pro` 有 `expiresAt`；`enterprise` 可为 `null`（座席制，后端自行续期）。
- `features`：当前层级**已生效**的 feature list。`free` 下通常为空数组。
- `quota`：配额桶字典，key 见 §3.2。每个桶返回本账单周期的 `used` / `limit`。
- `expiresAt`：ISO 8601。若 `Date.parse(expiresAt) < now`，扩展端视为过期，降级为 Free。

**禁止**：在同一响应内返回 `tier: 'pro'` 但 `features` 全空 —— 这会让扩展无法判断后端是"未实装"还是"确实没权益"。

### 3.2 `QuotaBucket` keys（初版）

| Key                     | 单位  | Free 上限 | Pro 上限    | 补充                         |
| ----------------------- | ----- | --------- | ----------- | ---------------------------- |
| `input_translate_daily` | 次/天 | 50        | null (无限) | 自然日 UTC 重置              |
| `pdf_translate_daily`   | 页/天 | 50        | null        | 自然日 UTC 重置              |
| `vocab_count`           | 条    | 100       | null        | 生命周期累计                 |
| `ai_translate_monthly`  | 次/月 | 0         | 50_000      | 自然月 UTC 重置，仅 Pro 可用 |

> **`null` 或字段缺失** 视为"无限制"。扩展端 `hasFeature / quota` 检查需同时允许这两种表达。

### 3.3 `RequestId`

`consumeQuota` 必须携带 `request_id: string`（扩展端用 `crypto.randomUUID()`）。后端以 `(userId, request_id)` 作幂等键，TTL 24h。

---

## 4. Procedures

### 4.1 `billing.getEntitlements`

| 项            | 值                    |
| ------------- | --------------------- |
| Auth          | Required              |
| Input         | `{}`                  |
| Output        | `Entitlements`        |
| Cache-Control | `private, max-age=30` |
| Idempotent    | Yes                   |
| Rate limit    | 60 req / min / user   |

**错误：**
| oRPC code | HTTP | 语义 |
|-----------|------|------|
| `UNAUTHORIZED` | 401 | 未登录 / session 过期 |
| `INTERNAL_SERVER_ERROR` | 500 | 不可恢复 |

**扩展端行为：**

- 200 → 写入 Dexie `entitlements_cache` + Jotai atom
- 401 → 触发重新登录 UI；降级 Free
- 5xx / 网络错误 → 读 Dexie 缓存；若无则 Free

---

### 4.2 `billing.consumeQuota`

扣减指定桶的配额，原子操作。扩展在使用 Pro 功能**之前**调用，后端扣减后返回剩余额度。

| 项         | 值                                                                        |
| ---------- | ------------------------------------------------------------------------- |
| Auth       | Required                                                                  |
| Input      | `{ bucket: string, amount: number, request_id: string }`                  |
| Output     | `{ bucket: string, remaining: number \| null, reset_at: string \| null }` |
| Idempotent | **必须**（按 `request_id`）                                               |
| Rate limit | 300 req / min / user                                                      |

**输入校验：**

- `bucket` 必须在 §3.2 枚举内
- `amount >= 1`
- `request_id` 形如 UUID v4

**错误：**
| oRPC code | HTTP | 语义 |
|-----------|------|------|
| `UNAUTHORIZED` | 401 | 同上 |
| `BAD_REQUEST` | 400 | bucket 未知 / amount 不合法 |
| `QUOTA_EXCEEDED` | 402 | 额度不足，不扣减 |
| `FORBIDDEN` | 403 | Free 用户访问仅 Pro 桶 |

**幂等契约：**

- 同 `(userId, request_id)` 第 2 次及以后调用，**不再扣减**，返回与第 1 次完全一致的响应（包括错误）。
- TTL 24h。

**扩展端行为：**

- 成功 → 更新本地 atom 中的 `quota.<bucket>`
- `QUOTA_EXCEEDED` → 弹 `<UpgradeDialog>`
- 网络错误 → **不** retry（已 consumed 风险），直接报错给用户

---

### 4.3 `billing.createCheckoutSession`

生成 Stripe Checkout 会话。扩展打开返回的 `url` 在新标签完成支付。

| 项         | 值                                                                               |
| ---------- | -------------------------------------------------------------------------------- |
| Auth       | Required                                                                         |
| Input      | `{ plan: 'pro_monthly' \| 'pro_yearly', successUrl: string, cancelUrl: string }` |
| Output     | `{ url: string }`                                                                |
| Idempotent | 幂等可选（建议按 `userId + plan + 15min 窗口` 去重）                             |
| Rate limit | 10 req / min / user                                                              |

**输入约束：**

- `successUrl` / `cancelUrl` 必须是 `https://readfrog.app/*` 或 `chrome-extension://*`，避免 open-redirect。后端白名单校验。

**错误：**
| oRPC code | HTTP | 语义 |
|-----------|------|------|
| `UNAUTHORIZED` | 401 | |
| `BAD_REQUEST` | 400 | plan/URL 不合法 |
| `PRECONDITION_FAILED` | 412 | 用户已持有活跃 Pro 订阅（改走 `createPortalSession`） |

---

### 4.4 `billing.createPortalSession`

生成 Stripe Customer Portal 链接，已订阅用户去管理/取消。

| 项         | 值                  |
| ---------- | ------------------- |
| Auth       | Required            |
| Input      | `{}`                |
| Output     | `{ url: string }`   |
| Rate limit | 10 req / min / user |

**错误：**

- `UNAUTHORIZED` / `PRECONDITION_FAILED`（未订阅用户调用）

---

## 5. Stripe Webhook（后端内部，扩展不参与）

后端需在 `/api/stripe/webhook` 处理以下事件，并在处理成功后写 `user_entitlements` 表。每条事件**必须按 `event.id` 幂等**（TTL 30 天）。

| Stripe 事件                     | 行为                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | 创建/激活订阅 → 写入 `tier=pro`, `features`, `expiresAt`                                                |
| `customer.subscription.updated` | 续费、plan 变更 → 更新 `expiresAt` / `features`                                                         |
| `customer.subscription.deleted` | 立即到期 → `tier=free`, 清空 Pro `features`                                                             |
| `invoice.payment_failed`        | **7 天宽限期**：保留 `tier=pro` 但加 flag `in_grace_period`（扩展端可用 `quota` 或单独字段展示 banner） |
| `invoice.payment_succeeded`     | 清除宽限期 flag                                                                                         |

**签名校验**：所有 webhook 必须用 `STRIPE_WEBHOOK_SECRET` 验证 `Stripe-Signature` header。校验失败直接 400，不重试、不落库。

**关键变量**

- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`：仅后端持有，严禁出现在扩展 build。本扩展的 `check-api-key-env` Vite 插件会拦截 `WXT_*_API_KEY` 泄漏，但最终 review 必须人肉确认。

---

## 6. 观测与日志

### 6.1 结构化日志（后端）

每次 `billing.*` 调用：

```json
{
  "event": "billing.getEntitlements",
  "user_id": "u_xxx",
  "tier": "pro",
  "latency_ms": 42,
  "outcome": "success" | "quota_exceeded" | "error",
  "request_id": "uuid-or-null"
}
```

### 6.2 PostHog 事件

- `billing_quota_consumed` props: `bucket`, `amount`, `remaining`, `tier`
- `billing_quota_exceeded` props: `bucket`, `tier`
- `billing_checkout_started` props: `plan`
- `billing_checkout_completed` props: `plan`, `cents`
- `billing_subscription_cancelled` props: `tier_before`

扩展端与后端**可能双方都上报**（确保至少一端有）；用 `$insert_id = request_id` 做去重。

---

## 7. 版本演进

- 本契约标为 v1。扩展端 `src/types/entitlements.ts` 在任何破坏性变更时同步 bump。
- 增加新 `FeatureKey` / `QuotaBucket` key 为**非破坏性**，后端可先上线。扩展端老版本会忽略未知字段。
- 移除 `FeatureKey` / 改字段类型为**破坏性**，需：
  1. 契约 v2 草稿 PR
  2. 扩展仓 PR 同步 schema
  3. 后端灰度切换

---

## 8. 扩展端契约消费 checklist（交叉验证）

后端实现完以下可供扩展联调：

- [ ] `billing.getEntitlements` 返回 Free/Pro 两种账号
- [ ] `billing.consumeQuota` 幂等（同 request_id 调两次返回一致）
- [ ] `billing.consumeQuota` Free 账号调 Pro 桶返回 403
- [ ] `billing.createCheckoutSession` 返回有效 Stripe URL
- [ ] webhook `checkout.session.completed` 之后 30s 内 `getEntitlements` 反映为 Pro
- [ ] webhook `customer.subscription.deleted` 后反映为 Free
- [ ] webhook `invoice.payment_failed` 进入 7 天宽限

扩展端 M0 Task 1–6 完成后即可跑通联调。

---

## 9. 变更记录

| 日期       | 版本     | 说明 | 作者                    |
| ---------- | -------- | ---- | ----------------------- |
| 2026-04-20 | v1 draft | 初稿 | @iannoying (via Claude) |
