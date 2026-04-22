# `billing.*` oRPC 契约 (v2)

> **Audience:** GetU Translate 后端团队（`getu-translate` monorepo）
> **Consumer:** 浏览器扩展 `apps/extension`（WXT）及 `apps/web`（Next.js）
> **Status:** Active — Phase 4 Paddle-native subscriptions
> **Owner:** 后端团队
> **Last updated:** 2026-04-22

---

## 1. 设计目标

1. **扩展端无状态**：所有订阅/配额状态以后端为准，扩展只做 30s-ish 本地缓存 + 离线降级。
2. **失败安全**：任何 billing 接口故障必须降级到 **Free tier**，不允许"降级到 Pro"。
3. **幂等**：`consumeQuota` 因网络重试可能被调用多次 —— 支持 `request_id` 幂等键。
4. **可观测**：所有 billing 接口接入后端标准日志 + PostHog `billing_*` 事件。
5. **支付商抽象**：所有字段用 `billing_provider` / `provider_customer_id` / `provider_subscription_id`，不绑定具体支付商，便于将来添加 Stripe 支持。

---

## 2. 认证与会话

- 所有 `billing.*` 接口 **要求已登录**（better-auth session cookie）。
- 扩展端通过 `authClient` 维护 session；所有 oRPC 请求带 `credentials: "include"` + `x-orpc-source: extension` header。
- 未登录调用任意 `billing.*` → 后端返回 oRPC 错误码 `UNAUTHORIZED` (HTTP 401)。扩展端应 catch 并回退到 `FREE_ENTITLEMENTS`。

---

## 3. 数据模型

### 3.1 `Entitlements`

与 `packages/contract/src/billing.ts` 中的 `EntitlementsSchema` **逐字节一致**。后端序列化时必须产出与下面 zod schema 能 parse 的 JSON。

```ts
const FeatureKey = z.enum([
  'pdf_translate',                  // PDF 双语翻译
  'pdf_translate_unlimited',        // PDF 翻译无限页数
  'pdf_translate_export',           // PDF 导出
  'input_translate_unlimited',      // 输入框翻译无限次
  'vocab_unlimited',                // 生词本无限条
  'vocab_cloud_sync',               // 生词本云同步
  'ai_translate_pool',              // 共享 AI 翻译配额池
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
  graceUntil: z.string().datetime().nullable(),   // v2 新增
  billingEnabled: z.boolean(),                    // v2 新增
  billingProvider: z.enum(['paddle', 'stripe']).nullable(), // v2 新增
})
```

**字段约定：**

- `tier`：订阅层。`free` 始终可用；`pro` 有 `expiresAt`；`enterprise` 可为 `null`（座席制，后端自行续期）。
- `features`：当前层级**已生效**的 feature list。`free` 下通常为空数组。
- `quota`：配额桶字典，key 见 §3.2。每个桶返回本账单周期的 `used` / `limit`。
- `expiresAt`：ISO 8601。若 `Date.parse(expiresAt) < now`，扩展端视为过期，降级为 Free。
- `graceUntil`：ISO 8601 或 null。支付失败后的宽限期截止时间；在此期间保留 Pro 权益并展示 banner。宽限期内 `tier` 仍为 `pro`，`expiresAt` 不变。
- `billingEnabled`：是否已对该用户开启计费功能（内测/灰度控制）。`false` 时 `createCheckoutSession` 返回 412。
- `billingProvider`：当前订阅所属支付商（`"paddle"` | `"stripe"` | `null`）。Free 用户或未订阅时为 `null`。

**禁止**：在同一响应内返回 `tier: 'pro'` 但 `features` 全空 —— 这会让扩展无法判断后端是"未实装"还是"确实没权益"。

### 3.2 `QuotaBucket` keys

| Key                     | 单位  | Free 上限 | Pro 上限    | 补充                         |
| ----------------------- | ----- | --------- | ----------- | ---------------------------- |
| `input_translate_daily` | 次/天 | 50        | null (无限) | 自然日 UTC 重置              |
| `pdf_translate_daily`   | 页/天 | 50        | null        | 自然日 UTC 重置              |
| `vocab_count`           | 条    | 100       | null        | 生命周期累计                 |
| `ai_translate_monthly`  | 次/月 | 0         | 50_000      | 自然月 UTC 重置，仅 Pro 可用 |

> **`null` 或字段缺失** 视为"无限制"。

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

---

### 4.3 `billing.createCheckoutSession`

生成 Paddle Checkout 会话。扩展打开返回的 `url` 在新标签完成支付。

| 项         | 值                                                                               |
| ---------- | -------------------------------------------------------------------------------- |
| Auth       | Required                                                                         |
| Input      | `{ plan: 'pro_monthly' \| 'pro_yearly', successUrl: string, cancelUrl: string }` |
| Output     | `{ url: string }`                                                                |
| Idempotent | 幂等可选（建议按 `userId + plan + 15min 窗口` 去重）                             |
| Rate limit | 10 req / min / user                                                              |

**输入约束：**

- `successUrl` / `cancelUrl` 必须匹配以下前缀之一，避免 open-redirect：
  - `https://getutranslate.com/`
  - `https://www.getutranslate.com/`
  - `chrome-extension://`

**错误：**
| oRPC code | HTTP | 语义 |
|-----------|------|------|
| `UNAUTHORIZED` | 401 | 未登录 |
| `BAD_REQUEST` | 400 | plan/URL 不合法 |
| `PRECONDITION_FAILED` | 412 | `billingEnabled=false` 该用户尚未开放计费功能 |
| `PRECONDITION_FAILED` | 412 | 用户已持有活跃 Pro 订阅（改走 `createPortalSession`） |

---

### 4.4 `billing.createPortalSession`

生成 Paddle Customer Portal 链接，已订阅用户去管理/取消。

| 项         | 值                  |
| ---------- | ------------------- |
| Auth       | Required            |
| Input      | `{}`                |
| Output     | `{ url: string }`   |
| Rate limit | 10 req / min / user |

**错误：**
| oRPC code | HTTP | 语义 |
|-----------|------|------|
| `UNAUTHORIZED` | 401 | 未登录 |
| `PRECONDITION_FAILED` | 412 | 该用户无 `provider_customer_id`（从未订阅过） |

---

## 5. Paddle Webhook（后端内部，扩展不参与）

### 5.1 端点

```
POST /api/billing/webhook/paddle
```

路径使用 `/billing/webhook/` 前缀，预留将来添加 `/api/billing/webhook/stripe`，共用同一套 `apply.ts` 内部逻辑。

### 5.2 签名校验

Paddle 在请求头附带：

```
Paddle-Signature: ts=<unix_timestamp>;h1=<hmac-sha256>
```

校验方法：以 `PADDLE_WEBHOOK_SECRET` 为密钥，对字符串 `"<ts>:<raw_body>"` 做 HMAC-SHA256，对比 `h1` 字段。校验失败直接返回 400，不重试、不落库。

### 5.3 幂等

所有 webhook 事件**必须按 `event.event_id` 幂等**，使用 `billing_webhook_events` 表：

```sql
CREATE TABLE billing_webhook_events (
  event_id   TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- TTL 30 天由 cron 或 partitioning 清理
);
```

处理前先 `INSERT OR IGNORE`；若已存在则直接返回 200（不重新处理）。

### 5.4 事件映射表

| Paddle 事件                          | 内部行为                                                                     | `user_entitlements` 写入列                                     |
| ------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `subscription.activated`             | 首次激活订阅                                                                 | `tier=pro`, `features`, `expires_at`, `billing_provider=paddle`, `provider_subscription_id`, `provider_customer_id` |
| `subscription.created`               | 订阅创建（通常与 activated 同时触发）                                        | 同上                                                           |
| `subscription.updated`               | 续费、plan 变更、宽限期清除                                                  | `expires_at`, `features`, `grace_until=null`（清宽限期时）     |
| `subscription.canceled`              | 用户取消；在当前计费周期末生效                                               | 保留 `tier=pro` 至 `expires_at`，到期后由 cron 降级            |
| `subscription.past_due`              | 支付失败，进入宽限期                                                         | `grace_until = NOW() + 7 days`                                 |
| `subscription.paused`                | 订阅暂停                                                                     | `tier=free`, 清空 Pro `features`, `grace_until=null`           |
| `transaction.completed`              | 一次性支付成功（或订阅首次付款）                                             | 同 `subscription.activated`                                    |
| `transaction.payment_failed`         | 支付失败（重试中）                                                           | `grace_until = NOW() + 7 days`（若尚未设置）                   |

> **注：** 将来添加 Stripe 支持时，在 `/api/billing/webhook/stripe` 注册新处理器，共用同一套 `apply.ts` 写 `user_entitlements` 的逻辑，只需适配事件名映射。

### 5.5 关键环境变量

- `PADDLE_SECRET_KEY` / `PADDLE_WEBHOOK_SECRET`：仅后端持有，严禁出现在扩展 build。

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
  "outcome": "success | quota_exceeded | error",
  "request_id": "uuid-or-null"
}
```

### 6.2 PostHog 事件

- `billing_quota_consumed` props: `bucket`, `amount`, `remaining`, `tier`
- `billing_quota_exceeded` props: `bucket`, `tier`
- `billing_checkout_started` props: `plan`, `provider`
- `billing_checkout_completed` props: `plan`, `cents`, `provider`
- `billing_subscription_cancelled` props: `tier_before`, `provider`

---

## 7. 版本演进

- **增加新 `FeatureKey` / `QuotaBucket` key** 为**非破坏性**，后端可先上线。扩展端老版本会忽略未知字段。
- **移除 `FeatureKey` / 改字段类型** 为**破坏性**，需：
  1. 契约 vN 草稿 PR
  2. 扩展仓 PR 同步 schema
  3. 后端灰度切换

### v2 变更摘要（2026-04-22）

- `EntitlementsSchema` 新增三个字段：`graceUntil`、`billingEnabled`、`billingProvider`
- `billingContract` 新增两个 procedure：`createCheckoutSession`、`createPortalSession`
- `createCheckoutSession` URL 白名单限制改为 `getutranslate.com` + `chrome-extension://`（原 `readfrog.app`）
- Webhook 端点从 `/api/stripe/webhook` 改为 `/api/billing/webhook/paddle`（支付商前缀隔离）
- 所有字段名用 `billing_provider` / `provider_customer_id` / `provider_subscription_id`，不再用 `stripe_*`

---

## 8. 扩展端契约消费 checklist（交叉验证）

后端实现完以下可供扩展联调：

- [ ] `billing.getEntitlements` 返回 Free/Pro 两种账号（含 v2 字段）
- [ ] `billing.consumeQuota` 幂等（同 request_id 调两次返回一致）
- [ ] `billing.consumeQuota` Free 账号调 Pro 桶返回 403
- [ ] `billing.createCheckoutSession` 返回有效 Paddle Checkout URL
- [ ] `billing.createCheckoutSession` billingEnabled=false 返回 412
- [ ] `billing.createPortalSession` 无 provider_customer_id 返回 412
- [ ] webhook `subscription.activated` 之后 30s 内 `getEntitlements` 反映为 Pro
- [ ] webhook `subscription.canceled` 后反映为 Free
- [ ] webhook `subscription.past_due` 后 `graceUntil` 有值

---

## 9. 变更记录

| 日期       | 版本     | 说明                                                       | 作者                    |
| ---------- | -------- | ---------------------------------------------------------- | ----------------------- |
| 2026-04-20 | v1 draft | 初稿（Stripe-native）                                      | @iannoying (via Claude) |
| 2026-04-22 | v2       | Paddle-native rewrite；EntitlementsSchema +3 字段；+2 procedure | Phase 4 T0 (via Claude) |
