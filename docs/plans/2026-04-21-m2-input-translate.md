# M2 · 输入框增强翻译（Input Translation 强化）· 实施计划

> **Parent plan:** `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md` → M2
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Goal

在现有"三连空格触发输入框翻译"（`selection.content/input-translation/use-input-translation.ts`）的基础上，补齐 M2 路线图里剩下的 **商业化闭环** 与 **触发方式扩展**：

1. **Free 用户每日 50 次额度**，超出后弹 `UpgradeDialog`；Pro (`input_translate_unlimited` feature) 无限制。
2. **Trigger Token 模式**：允许用户把触发方式从 "三连空格" 切换为输入 `//en `、`//zh ` 这类前缀 token（对标沉浸式翻译 / CopyCat）。

其他 M2 路线图条目拆分处理：

- 富文本编辑器适配（飞书 / Slack / WeChat Web）：因各家实现差异大，单独收尾里程碑，**不在本 M2 范围**。
- 域名 allowlist：已有 `siteControl` 全局 blacklist/whitelist 架构覆盖，**不再单独加**。

## Architecture

```
┌─ selection.content/input-translation/
│  ├─ use-input-translation.ts   [修改]  接入触发模式分支 + quota guard
│  ├─ triggers/                  [新增]  三种触发策略：triple-space / token / none
│  │  ├─ triple-space.ts
│  │  ├─ token.ts                  解析 "//en foo" → { text:'foo', toLang:'en' }
│  │  └─ index.ts
│  └─ quota/                     [新增]
│     ├─ use-input-quota.ts        统计当日已用次数（读 Dexie）
│     └─ __tests__/
├─ utils/db/dexie/tables/
│  └─ input-translation-usage.ts  [新增]  { dateKey, count } 日聚合
├─ types/config/config.ts         [修改]  inputTranslationSchema 新增
│                                         triggerMode + tokenPrefix
├─ utils/config/migration-scripts/
│  └─ vXXX-to-vYYY.ts              [新增]  默认 triggerMode='triple-space', tokenPrefix='//'
└─ entrypoints/options/pages/translation/input-translation/
   └─ index.tsx                    [修改]  暴露 triggerMode / tokenPrefix，显示当日使用量
```

## Preconditions

- M0 entitlements + `useProGuard` 已完成（`apps/extension/src/hooks/use-pro-guard.ts`）
- M0 `input_translate_unlimited` feature key 已注册在 `types/entitlements.ts`
- 现有 `use-input-translation.ts` 覆盖三连空格触发 + undo + race guard

## Delivery Strategy

两个 PR：

- **PR 1 (Task 1–3)**: Quota 基建（Dexie table + hook + ProGuard 接入）
- **PR 2 (Task 4–7)**: Trigger token 模式 + options UI + i18n + migration

每个 PR 合并前：

1. 新 worktree 同仓库 `.claude/worktrees/m2-input-translate`
2. CI 绿灯后用 `subagent codex:adversarial-review` 复核
3. 审查通过 → `gh pr merge --squash --auto`

---

## Task 1: 新增 Dexie 表 `input_translation_usage`

**Goal:** 以 `dateKey` (YYYY-MM-DD, 本地时区) 为主键的日聚合计数表。

**Files:**

- Create: `apps/extension/src/utils/db/dexie/tables/input-translation-usage.ts`
- Create: `apps/extension/src/utils/db/dexie/tables/__tests__/input-translation-usage.test.ts`
- Modify: `apps/extension/src/utils/db/dexie/schema.ts`（or 同等 db bootstrap；按现存 entitlements-cache.ts 的 pattern 走）

**Step 1 · 写失败测试**

```ts
// input-translation-usage.test.ts
describe('inputTranslationUsage', () => {
  beforeEach(async () => { await db.inputTranslationUsage.clear() })

  it('increments counter for today', async () => {
    await incrementInputTranslationUsage(new Date('2026-04-21T01:00:00Z'))
    await incrementInputTranslationUsage(new Date('2026-04-21T01:30:00Z'))
    const n = await getInputTranslationUsage(new Date('2026-04-21T02:00:00Z'))
    expect(n).toBe(2)
  })

  it('separates counters per day', async () => {
    await incrementInputTranslationUsage(new Date('2026-04-20T23:59:00Z'))
    await incrementInputTranslationUsage(new Date('2026-04-21T00:01:00Z'))
    expect(await getInputTranslationUsage(new Date('2026-04-21T10:00:00Z'))).toBe(1)
  })

  it('returns 0 when no rows for today', async () => {
    expect(await getInputTranslationUsage(new Date('2030-01-01'))).toBe(0)
  })
})
```

**Step 2 · 最小实现**

API：
- `incrementInputTranslationUsage(now: Date = new Date()): Promise<number>` — 返回累计后的值
- `getInputTranslationUsage(now: Date = new Date()): Promise<number>`
- `dateKey(now: Date)` — 本地 `YYYY-MM-DD`，便于单元测试注入

**Step 3 · Commit**

`feat(db): add input_translation_usage daily counter (M2 Task 1)`

---

## Task 2: `useInputTranslationQuota` hook

**Goal:** 封装"当天已用 / 剩余额度 / 是否可翻译"的反应式读取。

**Files:**

- Create: `apps/extension/src/entrypoints/selection.content/input-translation/quota/use-input-quota.ts`
- Create: 同目录 `__tests__/use-input-quota.test.tsx`
- Modify: `packages/definitions/src/config/input-translation.ts`（如定义集中在此）新增常量 `FREE_INPUT_TRANSLATION_DAILY_LIMIT = 50`

**Hook 接口**

```ts
export interface InputQuotaState {
  isLoading: boolean
  used: number
  limit: number | 'unlimited'
  canTranslate: boolean
  /** 真正调用翻译前调用；返回 false 表示配额耗尽 */
  checkAndIncrement: () => Promise<boolean>
}
export function useInputTranslationQuota(): InputQuotaState
```

**Step 1 · 失败测试**

- Free user, used=0 → canTranslate=true
- Free user, used=50 → canTranslate=false
- Pro user (has `input_translate_unlimited`) → limit='unlimited' 且 canTranslate=true
- `checkAndIncrement` 在 free 50 用满时返回 false 且不增加计数
- Loading 态 canTranslate=false

Mock：`useEntitlements` via `vi.mock('@/hooks/use-entitlements')`，Dexie via fake backend.

**Step 2 · 实现要点**

- 用 `hasFeature(entitlements, 'input_translate_unlimited')` 判断 Pro
- 每次 `checkAndIncrement` → 先 get → 再 increment → 返回 `used+1 <= limit`（atomic in Dexie transaction）
- 订阅 Dexie liveQuery 以便 options 页实时显示剩余额度

**Step 3 · Commit**

`feat(input): add useInputTranslationQuota hook with pro gating (M2 Task 2)`

---

## Task 3: 在 `use-input-translation.ts` 接入 quota + ProGuard

**Files:**

- Modify: `apps/extension/src/entrypoints/selection.content/input-translation/use-input-translation.ts`
- Modify: `apps/extension/src/entrypoints/selection.content/index.tsx`（如 hook 使用处需要加 UpgradeDialog mount）

**Step 1 · 失败测试**

添加集成测试或扩展现有 __tests__：
- Free user 第 51 次触发 → 不调用 `translateTextForInput`，call `guard(FEATURE.INPUT_TRANSLATE_UNLIMITED)` → `UpgradeDialog` 打开
- Pro user 第 200 次触发 → 正常翻译
- Quota loading → 不触发翻译（避免误扣）

**Step 2 · 实现要点**

```ts
const { guard, dialogProps } = useProGuard()
const quota = useInputTranslationQuota()

// 在 handleTranslation 开头：
if (quota.isLoading) return
const ok = await quota.checkAndIncrement()
if (!ok) {
  guard('input_translate_unlimited', { source: 'input-translation-daily-limit' })
  return
}
```

并把 `<UpgradeDialog {...dialogProps} />` 挂载到 selection.content root（或 reuse 已有挂点）。

**PR 1 (= Task 1–3) 合并条件**：

- [ ] 新增测试全绿；既有测试无回归
- [ ] `pnpm -F @getu/extension type-check` 无错
- [ ] `pnpm lint` 无错
- [ ] Changeset：`"feat: enforce daily quota on input-field translation for free users (M2 Task 1-3)"`

---

## Task 4: Trigger token 解析器

**Goal:** 输入框末尾出现 `//<lang> ` / `//<lang>\n` → 捕获 `<text>` + `<lang>`。

**Files:**

- Create: `apps/extension/src/entrypoints/selection.content/input-translation/triggers/token.ts`
- Create: 同目录 `__tests__/token.test.ts`

**函数签名**

```ts
export interface TokenTrigger {
  prefix: string            // '//' by default
  defaultLang: string       // fallback toLang
  knownLangs: string[]      // e.g. ['en','zh','ja','ko',...]
}

export interface TokenMatch {
  text: string              // 前面的原文
  toLang: string            // 解析出的语言
  consumedSuffix: string    // '//en ' 之类
}

export function matchTokenTrigger(raw: string, cfg: TokenTrigger): TokenMatch | null
```

**Step 1 · 失败测试（≥ 8 条）**

```
'hello //en '           → { text:'hello', toLang:'en', consumedSuffix:'//en ' }
'你好 //en\n'           → { text:'你好',  toLang:'en', consumedSuffix:'//en\n' }
'yo //unknown '          → null  (unknown lang → fallthrough)
'//en '                  → null (text 为空)
'plain text'             → null
'wait // '               → null (无 lang)
'foo //EN '              → 大小写不敏感
'foo // en '             → null (prefix 后紧跟 lang)
```

**Step 2 · 实现**：正则 `new RegExp(\`${escape(cfg.prefix)}(\\w+)[ \\n]$\`)`。

**Step 3 · Commit**：`feat(input): add trigger token parser (M2 Task 4)`

---

## Task 5: Config schema 扩展 + migration

**Files:**

- Modify: `apps/extension/src/types/config/config.ts` — `inputTranslationSchema` 新增：
  - `triggerMode: z.enum(['triple-space','token'])` 默认 `'triple-space'`
  - `tokenPrefix: z.string().min(1).max(4)` 默认 `'//'`
- Create: `apps/extension/src/utils/config/migration-scripts/vXXX-to-vYYY.ts`（按现存 v045-to-v046 模式；version 号依次 +1，由 `config/schema-version.ts` 推）
- Create: `apps/extension/src/utils/config/__tests__/example/vYYY.ts`

**测试**：migration 保持老字段、注入新默认值。

**Commit**：`feat(config): add inputTranslation.triggerMode + tokenPrefix (M2 Task 5)`

---

## Task 6: Hook 分派至 triple-space / token

**Files:**

- Refactor: `apps/extension/src/entrypoints/selection.content/input-translation/use-input-translation.ts` 抽出 listener 配置为 switch；token 模式监听 `input` 事件而非 `keydown`

**Token 模式要点**：

- `input` 事件回调里读取 `value` / `textContent`，`matchTokenTrigger`
- 命中后：`preventDefault` 不适用；改为 `setTextWithUndo(element, match.text)`（去掉触发词）→ 同样的 quota check → 翻译
- `event.isComposing === true` 期间忽略（防止中文输入法确认阶段误触发）
- 与 triple-space 同复用 `handleTranslation`，只是 fromLang/toLang 由 match 提供

**测试**：

- Token 模式下输入 `hi //en ` → 调用 `translateTextForInput('hi', 'auto', 'en')`
- IME composition 期间输入 `//en ` 不触发
- triple-space 模式下输入 `//en ` 不触发

**Commit**：`feat(input): dispatch trigger between triple-space and token modes (M2 Task 6)`

---

## Task 7: Options UI + i18n + usage 可视化

**Files:**

- Modify: `apps/extension/src/entrypoints/options/pages/translation/input-translation/...`
  - Radio：Triple-space / Trigger token
  - Token prefix input（仅 token 模式可见）
  - 今日已用 `N / 50`（Free 显示），Pro 显示"无限制"
- Modify: `apps/extension/src/locales/*.yml`（8 语种）新增 i18n key
- Modify: `.changeset/` 新增 `m2-input-translation-enhancements.md`

**本地验证**：

- `pnpm -F @getu/extension dev`
- Options 页切换到 Token 模式，prefix 改成 `++`
- 在 `input.html` 或任意 textarea 测 `你好 ++en ` 翻译成功
- 改回 triple-space，连续 3 次空格翻译成功
- Free 账号（mock）翻译 51 次弹 UpgradeDialog

**Commit**：`feat(options): expose input-translation trigger mode and usage (M2 Task 7)`

---

## PR 拆分

### PR #A — Quota gating（Task 1–3）

Branch: `feat/m2-input-quota`
Labels: `milestone:m2,area:billing,type:feature`

### PR #B — Trigger token mode（Task 4–7）

Branch: `feat/m2-input-trigger-token`（基于 PR #A 合并后 `main` re-branch）
Labels: `milestone:m2,area:input,type:feature`

## Acceptance (M2 total)

- [ ] Free 用户第 51 次输入翻译被拦截，UpgradeDialog 正常弹出
- [ ] Pro 用户无限次 OK
- [ ] 三连空格 / token 模式切换后行为正确
- [ ] 中文 IME composition 期间不误触发
- [ ] `pnpm test && pnpm type-check && pnpm lint` 全绿
- [ ] 两条 changeset 入 `.changeset/`
- [ ] 每个 PR 通过 `codex:adversarial-review` 复审并 merge

## 出 scope（延后）

- Lark / Slack / WeChat 富文本适配 → 新里程碑 `M2.5` 或社区贡献
- Cloud sync 输入记录 → 绑定 M5 生词本云同步
- 输入框内选词翻译 → 暂无需求，如有再开
