# Web 文本翻译与 PDF 文档翻译 — 设计文档

> **状态**: 已确认，待实施
> **日期**: 2026-04-25
> **范围**: `apps/web` 新增 `/translate`（文本翻译）与 `/document`（PDF 翻译）两条顶级路由
> **参考**: 沉浸式翻译 [/translate](https://immersivetranslate.com/zh-Hans/translate/) 与 [/document](https://immersivetranslate.com/zh-Hans/document/)

---

## 目标

在现有 `apps/web` 站点（目前为营销 + 账户）增加两条**付费驱动**的核心翻译能力：

1. **文本翻译 `/translate`**：单段文本，11 个模型并排对比，免费用户只看谷歌/微软真译文，其他列引导升级
2. **PDF 翻译 `/document`**：上传 PDF，单一模型异步翻译，输出双语对照 HTML/MD

两者共享配额钱包但分项计数，每月 1 号续杯，所有历史可查。

> **关键背景**：扩展端 `apps/extension/pdf-viewer/` 已能浏览器内翻译 PDF（基于 PDF.js）。Web 端的 `/document` **不复用**该实现，因为它是浏览器内渲染，无法在 Cloudflare Workers 服务端跑。Web `/document` 是一条独立的服务端管线（C 路径 MVP → A 路径 BabelDOC 升级）。

---

## 核心决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 功能定位 | Pro 会员卖点之一，质量对标沉浸式翻译 | 决定了 UX 完整度（多列对比）与计费模型 |
| 路由结构 | 顶级 `/translate` `/document`，与营销页平级 | 与沉浸式翻译一致，URL 简短易传播 |
| 实施顺序 | 先文本翻译，再 PDF 翻译 | 文本翻译技术风险低，先打通"登录→选模型→计配额→出结果→卖 Pro"业务链路 |
| PDF 路径 | C → A：MVP 走文本提取 + 双栏 HTML/MD；后续按数据决定是否升级 BabelDOC | 沉浸式翻译同款 BabelDOC 是 Python + GPU，运维重；MVP 先验证付费 |
| 多模型对比 | 11 个固定卡片，无加列/删列，仅拖拽重排 | 用户操作简化，UI 一致性高，免费用户也能看到 Pro 模型的"被锁"状态形成转化压力 |
| 模型清单 | 谷歌、微软（免费）+ 9 个 LLM（Pro） | 见下方模型清单 |
| 配额单位 | 文本/PDF 三套独立计数器（请求次数、token、页数） | 用户认知直观，分别对齐三种成本结构 |
| 续杯 | 每月 1 号 UTC 0:00 重置 | SaaS 标准做法，培养月度回访 |
| 字符限制 | 免费 2000 / Pro 20000（`text.length`） | 对齐 DeepL 基准，留出升级空间 |
| 历史记录 | 文本与 PDF 各一套，左侧抽屉默认收起 | 跨设备同步，回填零成本（不重新调 API） |
| 匿名体验 | 完整 UI + 写死示例译文 + 翻译按钮触发登录弹窗 | SEO 友好且转化漏斗短 |
| 异步管线 | Cloudflare Queues + R2 存储 + 轮询查询状态 | 与现有 Workers 体系契合，零额外部署 |
| 拖拽库 | `@dnd-kit/core` | 轻量、无障碍好 |
| 状态管理 | Jotai（对齐扩展端） | monorepo 内技术栈一致 |

---

## 模型清单

写入 `packages/definitions/providers.ts`（从 `apps/extension/src/utils/providers/options.ts` 抽出，扩展和 web 共用）。

| 模型 ID | 显示名 | 类型 | 免费可用 |
|---|---|---|---|
| `google` | 谷歌翻译 | translate-api | ✅ |
| `microsoft` | 微软翻译 | translate-api | ✅ |
| `deepseek-v4-pro` | DeepSeek-V4 Pro | llm | ❌ |
| `qwen-3.5-plus` | Qwen 3.5 Plus | llm | ❌ |
| `glm-5.1` | GLM-5.1 | llm | ❌ |
| `gemini-3-flash-preview` | Gemini 3 Flash | llm | ❌ |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro | llm | ❌ |
| `gpt-5.4-mini` | GPT-5.4 mini | llm | ❌ |
| `gpt-5.5` | GPT-5.5 | llm | ❌ |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | llm | ❌ |
| `coder-claude-4.7-opus` | Claude 4.7 Opus | llm | ❌ |

> 模型 ID 在上线前需用 ai-sdk 实际验证可达性。清单从 DB `pricing_plans.models` 读，热更新无需发版。

---

## 配额表（写入 `pricing_plans` 表，可热改）

| 资源 | 匿名 | 免费（登录） | Pro |
|---|---|---|---|
| 文本翻译次数（每月） | 0 | **100** | — |
| 文本翻译 LLM token（每月） | 0 | 0（不能用 LLM） | **2,000,000** |
| PDF 页数（每月） | 0 | **10** | **500** |
| 单次输入字符上限 | 0 | **2,000** | **20,000** |
| 单 PDF 上限 | — | 50 MB / 200 页 | 50 MB / 200 页 |
| 文本翻译速率 | — | 10 次/分钟 | 10 次/分钟 |
| 并发 PDF 任务 | — | 1 | 1 |
| 历史保留 | — | 文本 30 天 / PDF 30 天 | 文本永久 / PDF 90 天 |

**计数规则**：

- **文本翻译次数**：每"翻译"按钮点击 = 1 次，不论列数（免费用户多列只扣 1 次）
- **文本翻译 token**：仅 Pro，计 LLM 列的 prompt + completion；G/M 不计 token
- **PDF 页数**：按源 PDF 页数；空白/纯图页也算 1 页；**整文档原子扣减**，配额不足整单拒绝
- **续杯**：每月 1 号 UTC 0:00 重置；UI 文案用"本月剩余"避免时区困惑

---

## 路由与文件结构

```
apps/web/app/[locale]/
├── translate/
│   ├── page.tsx                    # 文本翻译主页
│   └── components/
│       ├── TranslateShell.tsx      # 左侧导航（文本/文档/Pro）
│       ├── HistoryDrawer.tsx
│       ├── LangPicker.tsx
│       ├── ModelCard.tsx           # 单模型卡片
│       ├── ModelGrid.tsx           # 拖拽容器
│       ├── QuotaBadge.tsx
│       └── UpgradeModal.tsx
└── document/
    ├── page.tsx                    # 上传 + 历史抽屉
    └── [jobId]/
        └── view/page.tsx           # 翻译结果预览页

apps/api/src/orpc/translate/
├── text.ts                         # 文本翻译 procedure
├── document.ts                     # PDF 翻译（上传/状态/列表）
├── quota.ts                        # 配额校验/扣减中间件
└── models.ts                       # 模型清单 + free/pro 分类

apps/api/src/queue/
└── translate-document.ts           # Cloudflare Queue Consumer

packages/definitions/
└── providers.ts                    # 模型清单（扩展 + web 共用）

packages/contract/src/
└── translate.ts                    # oRPC 契约

packages/db/src/schema/
├── quota_ledger.ts
├── text_translations.ts
├── translation_jobs.ts
└── pricing_plans.ts
```

---

## 数据模型

### `quota_ledger`

```ts
{
  user_id: uuid (FK)
  resource: enum('text_request', 'text_token', 'pdf_page')
  amount_used: int
  period_yyyymm: varchar(6)         // '202604'
  PRIMARY KEY (user_id, resource, period_yyyymm)
}
```

单表三类资源、月份分桶；查询按当前月份过滤即可，无需定时清理。

### `text_translations`

```ts
{
  id: uuid PK
  user_id: uuid FK
  source_text: text
  source_lang: text
  target_lang: text
  results: jsonb                    // { 'google': '...', 'microsoft': '...', ... }
  created_at: timestamptz
  INDEX (user_id, created_at DESC)
}
```

- 免费用户的 `results` 只含 `google` / `microsoft`
- 失败列存 `{ error: '...' }`
- 不存 token 数 / 耗时（MVP 不需要）

### `translation_jobs`

```ts
{
  id: uuid PK
  user_id: uuid FK
  source_key: text                  // R2 key
  source_pages: int
  output_html_key: text NULL
  output_md_key: text NULL
  model_id: text
  source_lang: text
  target_lang: text
  status: enum('queued','processing','done','failed')
  engine: enum('simple','babeldoc') DEFAULT 'simple'   // 为 Phase A 留位
  error_message: text NULL
  created_at: timestamptz
  expires_at: timestamptz
  INDEX (user_id, created_at DESC)
  INDEX (status, created_at) WHERE status IN ('queued','processing')
}
```

### `pricing_plans`

```ts
{
  plan_id: text PK                  // 'free' | 'pro'
  quota: jsonb                      // { text_request: 100, text_token: 0, pdf_page: 10, ... }
  models: jsonb                     // [{ id: 'google', ... }, ...]
  updated_at: timestamptz
}
```

---

## 文本翻译流程 `/translate`

### UI 布局

```
┌─ TranslateShell ────────────────────────────────────────────┐
│ 文本│ 历史│ ┌─输入区─────────┐ ┌─谷歌翻译        ⋮─┐         │
│ 文档│(收起)│ │ [自动 ↓] ⇄ [英 ↓]│ │ 译文…              │         │
│ 升级│      │ │ ┌────────────┐  │ ├─微软翻译        ⋮─┤         │
│     │      │ │ │ 输入文本…  │  │ │ 译文…              │         │
│     │      │ │ └────────────┘  │ ├─DeepSeek-V4 🔒  ⋮─┤         │
│     │      │ │ 1234/2000      │ │ Pro 会员专用模型… │         │
│     │      │ │ [清空] [翻译]  │ │ ...                │         │
│     │      │ └────────────────┘ └────────────────────┘         │
│     │      │ 本月剩余: 87/100 次                                │
└──────────────────────────────────────────────────────────────────┘
```

### 触发与请求

**单次"翻译"按钮点击 = 11 列同时发起**：

1. 校验：登录态 + 字符数 ≤ 上限 + 速率 ≤ 10/分 + 月度配额 ≥ 1 次 → 扣 1 次
2. 11 个并发 oRPC 调用 `translate.text({ text, source, target, modelId, columnId })`
3. **G/M**：调 Google/MS Translator API，~1s 内返回完整文本
4. **LLM**（Pro）：ai-sdk v5 `streamText`，SSE 流式返回，前端用 Jotai atom 累积渲染
5. **被锁列**（免费用户的 LLM 列）：前端不发请求，直接渲染升级文案
6. 全部完成（或失败）后整单写入 `text_translations`

### 错误与重试

- 单列失败不影响其他列（独立 try/catch）
- 失败列显示"重试"按钮，**不再扣配额**（按钮已扣过 1 次）
- 配额不足：弹 `UpgradeModal`，**source = 'free_quota_exceeded'`
- 字符超限：禁用按钮 + 提示拆分或升级

### 匿名示例

- 写死示例输入："The quick brown fox jumps over the lazy dog. ..."
- 11 列预填示例译文（含 LLM 列，让用户预览效果）
- "翻译"按钮文案：**"登录后翻译"**
- 示例文本带 `<noscript>` fallback，SEO 友好

### 历史抽屉

- 默认收起；桌面端展开偏好记 localStorage
- 按时间分组：今天 / 昨天 / 本周 / 更早
- 每条显示：输入前 60 字 + 源/目标语言徽章 + 相对时间
- 点击条目 → 完整回填（输入 + 11 列），**不重新调 API**
- 单条删除 + 一键清空全部
- 搜索：MVP 仅前端模糊匹配最近 100 条

---

## PDF 翻译流程 `/document`

### 整体管线

```
[Web 上传]
  ↓ multipart upload 直传 R2
[R2: pdfs/{jobId}/source.pdf]
  ↓
[Worker: orpc/translate/document.create]
  ├─ 读 PDF 元数据（页数）
  ├─ 校验：登录态 + ≤ 50MB + ≤ 200 页 + 月度配额 ≥ 页数
  ├─ 扣页数（原子）
  ├─ INSERT translation_jobs (status='queued')
  ├─ 入 Cloudflare Queue
  └─ 返回 { jobId } 给前端
  ↓
[Queue Consumer Worker]
  ├─ 取 PDF → unpdf 提文本
  ├─ 按页 + 段落分块（500-1500 字符/块）
  ├─ 并发调用用户选定的单一模型翻译
  ├─ 重组双语 HTML（双栏）+ Markdown（段落交替）
  ├─ 写 R2: pdfs/{jobId}/output.html + output.md
  └─ UPDATE status='done', output_keys
  ↓
[前端轮询 status 接口，每 2s 一次]
  └─ done → 跳转 /document/{jobId}/view
```

### MVP 功能边界

✅ 支持：
- PDF 文本提取 + 段落翻译
- 单选模型（不做 PDF 多模型对比，避免 11× API 成本）
- 双语对照 HTML（左原文 / 右译文）
- Markdown 输出（段落交替）
- 在线预览 + 下载

❌ 暂不支持（明确推迟到 Phase A 或更后）：
- 保留 PDF 原版面（不输出翻译后的 PDF）
- OCR 扫描件（unpdf 提不到文本则报错"扫描件请等 v2"）
- 公式 / 图片 / 表格保留
- ePub / DOCX 等其他格式

### 进度与状态

- 前端轮询 `translate.document.status({ jobId })`，2s/次
- 状态流：`queued → processing → done | failed`
- 队列拥堵时显示"队列中第 N 位"

### 历史抽屉（同 `/document` 页面顶部按钮）

- 与文本翻译对称：右上角"翻译历史"按钮 → 打开抽屉
- 显示文件名、源页数、模型、状态、时间
- 点击 done 状态条目 → 跳到 `/document/{jobId}/view`
- 删除条目同步删 R2 文件

---

## 认证与 Gating

### 复用现状

- 复用 `apps/web/app/[locale]/log-in/` 与 `apps/api/src/auth.ts` 的 better-auth session
- 翻译页直接读 session cookie，无需新增登录方式

### Gating 中间件

```ts
async function requireQuota(ctx, resource, amount) {
  if (!ctx.session) throw new ORPCError('UNAUTHORIZED')
  const plan = await getUserPlan(ctx.session.userId)        // 'free' | 'pro'
  const used = await getMonthlyUsage(ctx.session.userId, resource)
  const limit = QUOTA_TABLE[plan][resource]
  if (used + amount > limit) throw new ORPCError('QUOTA_EXCEEDED', { source: resource })
  await incrementUsage(ctx.session.userId, resource, amount)
}

function requireModelAccess(plan, modelId) {
  const allowed = plan === 'pro' ? ALL_MODEL_IDS : FREE_MODEL_IDS
  if (!allowed.includes(modelId)) throw new ORPCError('PRO_REQUIRED', { modelId })
}
```

前端基于 `session.plan` 隐藏/锁定 UI，但 API 必须再校验一次防绕过。

### 升级弹窗 `<UpgradeModal source>`

埋点：`pro_upgrade_triggered { source }`，source 取值：

- `free_quota_exceeded` — 月度次数用完
- `pro_model_clicked` — 免费用户点了 Pro 模型卡片
- `pdf_quota_exceeded` — PDF 月度页数不足
- `char_limit_exceeded` — 单次输入超过 2000
- `history_cleanup_warning` — 临近 30 天清理

按 source 分析转化率，决定哪些 gating 是"金矿"。

---

## 防滥用

- 文本：每用户每分钟 ≤ 10 次（Cloudflare Rate Limiting）
- PDF：单文件 ≤ 50 MB / ≤ 200 页（前端 + 服务端双校验）
- PDF 并发：每用户 ≤ 1 任务（避免单人占满 Queue）
- 注册：邮箱验证（沿用现有体系）
- 注册风控：同 IP 当日 ≥ 5 个新账号触发审核
- G/M 缓存：相同 `(text, source, target)` Cloudflare KV 缓存 1 小时（命中不扣配额）

---

## 主要风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| G/M API 价格上调或限流 | 免费用户翻译失败 | 多 region key 池 + KV 缓存 + 监控告警 |
| LLM 模型 ID 漂移 | 11 列出现死链接 | 模型清单从 DB 读、热更新；UI 容错"该模型暂不可用" |
| Workers Queue 消费滞后 | PDF 排队几分钟 | 优先级队列：Pro 优先；进度页明确显示位次 |
| R2 成本失控 | 大量 PDF 占空间 | 30/90 天生命周期 + 上传时压缩 |
| 同 IP 多账号刷免费 | 月度成本被薅 | 邮箱验证 + 同 IP 风控 |
| 流式翻译被中断 | 浪费已消耗 token | 接受损失，不复杂化；按完整请求扣 token |
| Pro 模型成本失控 | 单个用户 200 万 token 全用于 Opus | 按模型分级扣减比例（v1.1，MVP 平均扣减） |

---

## 上线计划（PR 拆分）

| 阶段 | PR | 内容 | 工时 |
|---|---|---|---|
| **M1 基础设施** | PR1 | `packages/definitions/providers.ts` 抽出模型清单 | 0.5 天 |
| | PR2 | `packages/db` 新增 4 张表 + Drizzle 迁移 | 1 天 |
| | PR3 | `apps/api/src/orpc/translate/` 骨架 + quota 中间件 + 单测 | 2 天 |
| **M2 文本翻译** | PR4 | `/translate` 路由 + UI（静态示例） | 2 天 |
| | PR5 | 接通 G/M API + 流式 LLM | 2 天 |
| | PR6 | 历史抽屉 + 持久化 + 回填 | 1.5 天 |
| | PR7 | 升级弹窗 + 配额徽章 + 字符限制 + 埋点 | 1.5 天 |
| **M3 PDF 翻译** | PR8 | 上传 + R2 + 任务创建 + 配额 | 2 天 |
| | PR9 | Queue Consumer + unpdf 解析 + 分块 | 2 天 |
| | PR10 | 双语 HTML/MD 输出 + R2 写回 + 状态机 | 2 天 |
| | PR11 | 结果预览页 + 下载 + PDF 历史抽屉 | 2 天 |
| **M4 打磨** | PR12 | 定时清理 Worker + R2 生命周期 + 错误重试 | 1 天 |
| | PR13 | 埋点完善 + 观测 + 文档 | 1 天 |

**总工时：约 5 周**（一名全栈工程师，串行）。

---

## Phase A 升级路径（C → A，BabelDOC）

**触发条件**（数据驱动，不要拍脑袋启动）：

- PDF 月翻译量 ≥ 500 单 **且** Pro 用户 PDF 满意度调研 ≤ 4/5
- 用户反馈 top 3 出现"想要保留 PDF 原版面"

**架构变更**：

- 新增 `apps/babeldoc/`（Python + FastAPI）
- 部署：Modal（GPU serverless，按秒计费）；备选 Fly.io GPU
- `apps/api/` Queue Consumer 新增分支：上传时选 "标准翻译"（C，免费可用）vs "原版面翻译"（A，仅 Pro 且页数计费 × 2）
- `translation_jobs.engine = 'simple' | 'babeldoc'` 已在 MVP 留位

**MVP 阶段不写 Phase A 代码**，只确保 schema 和 UI 留扩展位。

---

## 推迟项（明确不在 MVP）

1. **BYOK（自带 API Key）** — 沉浸式翻译有，能让深度用户绕过 Pro 订阅。v1.2 按呼声决定
2. **术语表 / 翻译记忆** — 专业用户需求
3. **协作翻译 / 团队席位** — B2B
4. **API 对外开放** — 三方调用
5. **多目标语言一次翻译** — 一段中文同时翻英日韩
6. **历史服务端搜索** — MVP 仅前端模糊匹配最近 100 条
7. **PDF 多模型对比** — 单 PDF 只能选一个模型
8. **OCR 扫描件** — 提不到文本直接报错
9. **DOCX / ePub / Markdown 等其他文档格式** — 聚焦 PDF

---

## Pro 定价（占位，上线前 A/B）

成本测算（保守）：

- LLM token：~$5-8/Pro/月
- PDF 翻译：~$2-3/Pro/月
- R2 + DB：~$0.5/Pro/月
- **毛成本约 $10/Pro/月**

定价候选：

- $9.9/月（亏本拉新）
- $14.9/月（毛利 ~33%）
- **$19.9/月（毛利 ~50%，推荐）**
- $99/年（参考沉浸式翻译，年付优惠）

> 配额值与定价存 `pricing_plans` 表，调价不发版。

---

## 总结一句话

> **登录用户在 web 端可以做：(a) 单段文本同时用 11 个模型对比翻译，免费用户只看 G/M 真译文，其他列引导升级；(b) 上传 PDF 用单一模型异步翻译，输出双语对照 HTML/MD 下载。两类翻译共享 `quota_ledger` 但分项计数，每月 1 号续杯，所有历史可查。预计 5 周完成。**
