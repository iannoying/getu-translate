# Read Frog 对标沉浸式翻译 中长期路线图与 M1 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Scope note:** 本文件既是 **路线图（M0–M6）** 也是 **M1 的可执行 TDD 计划**。M2+ 的每个里程碑在开工前需重新走一遍 `superpowers:brainstorming` + `superpowers:writing-plans`，细化成新的 plan 文件。

**Goal:** 把 Read Frog 发展为"免费基础翻译 + 付费增强"的商业化浏览器翻译插件，在关键体验上追平沉浸式翻译，同时用 AI 语言学习差异化。

**Architecture:** 以现有 WXT + React 19 + Vercel AI SDK + Jotai + Dexie 技术栈为基座，按"核心触达 → 文档扩展 → 平台适配 → 学习闭环 → 商业化"五阶段渐进式扩展；所有外部翻译引擎通过统一 `TranslationProvider` 接口插拔；付费闭环建立在 better-auth + 现有 oRPC 后端上。

**Tech Stack:** WXT 0.20 / React 19 / Vercel AI SDK v6 / Jotai / Dexie / oRPC + better-auth / Tailwind v4 + shadcn / PostHog

---

## 战略定位

| 维度     | 沉浸式翻译                       | Read Frog 现状       | Read Frog 目标                |
| -------- | -------------------------------- | -------------------- | ----------------------------- |
| 触达面   | 网页/PDF/EPUB/字幕/输入框/图片   | 网页 + YouTube 字幕  | 追平                          |
| 引擎     | DeepL/有道/腾讯/Google/AI 全家桶 | 3 免费 + 20+ AI      | 补传统引擎                    |
| 学习闭环 | 基础生词本                       | 精读 + TTS（无闭环） | **差异化护城河**              |
| 商业化   | Pro 订阅 + 免费额度池            | BYO-Key 开源         | 三层：免费 / Pro / Enterprise |

**护城河**：沉浸式翻译 = "更快更全的翻译工具"；Read Frog = "AI 语言学习伴侣"（精读 + 生词本 + Anki + 自适应解释）。**不能在引擎数量上内卷**，要在学习闭环上做深。

---

## 里程碑路线图

每个 **M** 约 2–4 周 / 1 人。优先级按"用户留存 × 付费意愿 / 工程复杂度"排序。

### M0 · 商业化基础设施（2 周，先行依赖）

为所有付费功能铺路。

- 打通 better-auth 登录态在 extension 三端（popup/options/content）的同步
- 后端 `@read-frog/api-contract` 新增 `billing.*` 路由：`getEntitlements`、`consumeQuota`、Stripe webhook
- 本地 `EntitlementsContext` atom + Dexie 缓存（离线降级）
- Feature flag 机制（PostHog 已接入，只需包一层 `useFeatureFlag`）

**交付验证**：在任意功能入口加 `if (!entitlement.pro) showUpgrade()` 能正常拦截。

### M1 · 官方免费翻译引擎矩阵（2 周）⭐ 本文档详细拆解

沉浸式的免费用户全靠 Google/Bing Web 接口。Read Frog 当前已有 `google.ts`/`microsoft.ts`/`deeplx.ts`，但**只有 1–2 种实现**，稳定性不足。

目标：扩展 `TranslationProvider` 到 **Google Web / Microsoft Edge Auth / Bing Web / Yandex Web / LibreTranslate** 五家免费；增加健康探测 + 自动回退 + 限频熔断。

这是免费用户的生命线，也是承载千万级调用的基础设施。详见下文 **M1 任务拆解**。

### M2 · 输入框增强翻译（1.5 周）

沉浸式招牌功能。触发词如 `//en ` 自动把中文翻译为英文回填。

- 通用监听器：`contenteditable`、`<textarea>`、`<input>`
- 配置表：按域名 allowlist + 触发 token
- 冲突处理：飞书/Slack/WeChat Web 等富文本编辑器需单独适配
- **定价**：免费版每日 50 次；Pro 无限

### M3 · PDF 双语翻译（3 周）

基于 pdf.js viewer 注入覆盖层；不解析 PDF 源文件，而是在浏览器渲染后对 text layer 分段翻译并悬浮叠加。

- 复用现有段落批量翻译 pipeline
- 支持下载"带翻译标注的 PDF"（Pro 专享）
- **定价**：免费版水印 + 50 页/天；Pro 无水印无限制

### M4 · 字幕/视频平台扩展（2 周）

从 YouTube 扩展到 Netflix / Bilibili / X(Twitter) / TED / Udemy / Coursera。

- 抽象 `SubtitleAdapter` 接口，YouTube 改造成首个实现
- 每个平台独立 content script + manifest host permission
- 社区贡献友好：`src/entrypoints/subtitles.content/adapters/` 插件式目录

### M5 · 生词本 + Anki 闭环（3 周）⭐ 差异化核心

- Dexie schema：`words` 表（word / context / translation / mastery / next_review_at）
- 划词工具栏新增"加入生词本"按钮（复用现有 selection toolbar）
- SM-2 遗忘曲线调度，popup 新增"今日复习"页
- 导出：Anki `.apkg` / CSV / Obsidian Markdown
- **定价**：免费版 100 词；Pro 无限 + 云同步

### M6 · 术语表 + 风格库（1 周）

- 术语表：`{src, dst, context?}` 绑定到自定义 prompt，注入 `[GLOSSARY]` token
- 显示样式模板库：下划线/模糊/遮罩/行内替换 20+ preset

### 后续（非优先）

- EPUB / SRT / DOCX 文件上传翻译（M7）
- 图片 OCR 翻译（M8，需 Vision 模型）
- 会议实时语音翻译（M9，复杂度高）
- WebDAV / Supabase 云同步（M10，与生词本耦合）

---

## 商业化分层（三档）

| 档位       | 功能                                                                                       | 定价              |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------- |
| Free       | 全部官方免费引擎 / 基础网页翻译 / 50 次·日输入框 / 50 页·日 PDF / 100 词生词本             | ¥0                |
| Pro        | 无限引擎调用 / 去水印 PDF 下载 / 无限输入框 / 无限生词本 + 云同步 / 所有付费 AI 引擎额度池 | ¥28/月 或 ¥198/年 |
| Enterprise | 团队术语表共享 / SSO / 审计日志 / SLA                                                      | 按座席            |

**免费额度池**（Pro 专享 AI 调用）：后端走我们自己的 key，限流 + 计费，类似沉浸式的 "BabelDOC 额度"。用 M0 的 entitlements 接口扣减。

---

## M1 任务拆解（可执行 TDD 计划）

**M1 目标**：新增 3 个免费翻译 provider（Bing Web / Yandex Web / LibreTranslate），抽出统一 `FreeProviderHealth` 熔断层，失败自动回退。

**前置阅读**：

- `src/utils/host/translate/api/index.ts` — 现有免费 provider 调度器
- `src/utils/host/translate/api/google.ts` / `microsoft.ts` — 参考实现
- `src/utils/host/translate/api/__tests__/` — 测试惯例
- `AGENTS.md` — Testing Notes 段落（`SKIP_FREE_API=true`）

**通用约定**：

- 所有新 provider 放在 `src/utils/host/translate/api/`
- 测试放在 `src/utils/host/translate/api/__tests__/`，仿照现有 `free-api.test.ts` 的 describe 分组
- 每个 provider 必须导出 `translate(input: TranslateInput): Promise<TranslateOutput>` 签名和 `kind: "bing" | "yandex" | "libre"` 常量
- 网络请求走 `src/utils/http.ts` 封装（已有）

---

## Task 1: 抽取 `FreeProviderHealth` 熔断层

**Files:**

- Create: `src/utils/host/translate/api/health.ts`
- Create: `src/utils/host/translate/api/__tests__/health.test.ts`

**Step 1: 写失败测试**

```ts
// src/utils/host/translate/api/__tests__/health.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createHealthTracker } from '../health'

describe('FreeProviderHealth', () => {
  it('blocks provider after 3 consecutive failures within 60s', () => {
    const now = vi.fn(() => 1000)
    const h = createHealthTracker({ now, windowMs: 60_000, threshold: 3 })
    h.recordFailure('google')
    h.recordFailure('google')
    expect(h.isHealthy('google')).toBe(true)
    h.recordFailure('google')
    expect(h.isHealthy('google')).toBe(false)
  })

  it('recovers after cooldown', () => {
    let t = 1000
    const h = createHealthTracker({ now: () => t, windowMs: 60_000, threshold: 3, cooldownMs: 30_000 })
    h.recordFailure('bing'); h.recordFailure('bing'); h.recordFailure('bing')
    expect(h.isHealthy('bing')).toBe(false)
    t = 1000 + 31_000
    expect(h.isHealthy('bing')).toBe(true)
  })

  it('recordSuccess resets counter', () => {
    const h = createHealthTracker({ now: () => 1000, windowMs: 60_000, threshold: 3 })
    h.recordFailure('yandex'); h.recordFailure('yandex')
    h.recordSuccess('yandex')
    h.recordFailure('yandex'); h.recordFailure('yandex')
    expect(h.isHealthy('yandex')).toBe(true)
  })
})
```

**Step 2: 验证失败**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/health.test.ts`
Expected: FAIL, "Cannot find module '../health'"

**Step 3: 最小实现**

```ts
// src/utils/host/translate/api/health.ts
export type ProviderKind = 'google' | 'microsoft' | 'bing' | 'yandex' | 'libre' | 'deeplx'

export interface HealthOptions {
  now?: () => number
  windowMs?: number
  threshold?: number
  cooldownMs?: number
}

export function createHealthTracker(opts: HealthOptions = {}) {
  const now = opts.now ?? (() => Date.now())
  const windowMs = opts.windowMs ?? 60_000
  const threshold = opts.threshold ?? 3
  const cooldownMs = opts.cooldownMs ?? 30_000
  const failures = new Map<string, number[]>()
  const blockedUntil = new Map<string, number>()

  return {
    recordFailure(k: ProviderKind) {
      const t = now()
      const arr = (failures.get(k) ?? []).filter(ts => t - ts < windowMs)
      arr.push(t)
      failures.set(k, arr)
      if (arr.length >= threshold)
        blockedUntil.set(k, t + cooldownMs)
    },
    recordSuccess(k: ProviderKind) {
      failures.delete(k)
      blockedUntil.delete(k)
    },
    isHealthy(k: ProviderKind) {
      const until = blockedUntil.get(k)
      if (until == null)
        return true
      if (now() >= until) {
        blockedUntil.delete(k)
        return true
      }
      return false
    },
  }
}
```

**Step 4: 测试通过**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/health.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/utils/host/translate/api/health.ts src/utils/host/translate/api/__tests__/health.test.ts
git commit -m "feat(translate): add FreeProviderHealth circuit breaker"
```

---

## Task 2: Bing Web 翻译 provider

Bing 免费翻译通过 `https://www.bing.com/ttranslatev3` 接口，需要先抓 IG/IID token。

**Files:**

- Create: `src/utils/host/translate/api/bing.ts`
- Create: `src/utils/host/translate/api/__tests__/bing.test.ts`

**Step 1: 写失败测试（mock fetch）**

```ts
// src/utils/host/translate/api/__tests__/bing.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translateBing } from '../bing'

describe('translateBing', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns translated text on happy path', async () => {
    const html = '<html>IG:"ABC"; _G.IID="translator.5024"</html>'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => html })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ translations: [{ text: '你好' }] }] }))
    await expect(translateBing({ text: 'hello', from: 'en', to: 'zh-CN' }))
      .resolves.toEqual({ text: '你好' })
  })

  it('throws on missing IG token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, text: async () => '<html>no tokens</html>' }))
    await expect(translateBing({ text: 'hi', from: 'en', to: 'zh-CN' }))
      .rejects.toThrow(/IG/i)
  })
})
```

**Step 2: 验证失败**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/bing.test.ts`
Expected: FAIL

**Step 3: 最小实现**

```ts
// src/utils/host/translate/api/bing.ts
export interface BingInput { text: string, from: string, to: string }
export interface BingOutput { text: string }

let tokenCache: { ig: string, iid: string, key: string, token: string, fetchedAt: number } | null = null
const TOKEN_TTL = 30 * 60_000

async function fetchToken() {
  if (tokenCache && Date.now() - tokenCache.fetchedAt < TOKEN_TTL)
    return tokenCache
  const res = await fetch('https://www.bing.com/translator')
  const html = await res.text()
  const ig = html.match(/IG:"([^"]+)"/)?.[1]
  const iid = html.match(/_G\.IID="([^"]+)"/)?.[1]
  const params = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)"/)
  if (!ig || !iid || !params)
    throw new Error('Bing translator IG/IID/key not found')
  tokenCache = { ig, iid, key: params[1], token: params[2], fetchedAt: Date.now() }
  return tokenCache
}

export async function translateBing(input: BingInput): Promise<BingOutput> {
  const t = await fetchToken()
  const url = `https://www.bing.com/ttranslatev3?isVertical=1&IG=${t.ig}&IID=${t.iid}`
  const body = new URLSearchParams({ fromLang: input.from, to: input.to, text: input.text, key: t.key, token: t.token })
  const res = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  if (!res.ok)
    throw new Error(`Bing translate HTTP ${res.status}`)
  const data = await res.json() as Array<{ translations: Array<{ text: string }> }>
  return { text: data?.[0]?.translations?.[0]?.text ?? '' }
}
```

**Step 4: 测试通过**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/bing.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/utils/host/translate/api/bing.ts src/utils/host/translate/api/__tests__/bing.test.ts
git commit -m "feat(translate): add Bing web translation provider"
```

---

## Task 3: Yandex Web 翻译 provider

**Files:**

- Create: `src/utils/host/translate/api/yandex.ts`
- Create: `src/utils/host/translate/api/__tests__/yandex.test.ts`

**Step 1: 写失败测试**

```ts
// src/utils/host/translate/api/__tests__/yandex.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translateYandex } from '../yandex'

describe('translateYandex', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns translated text', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => 'SID: "abc.def"' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 200, text: ['bonjour'] }) }))
    await expect(translateYandex({ text: 'hello', from: 'en', to: 'fr' }))
      .resolves.toEqual({ text: 'bonjour' })
  })

  it('throws on Yandex error code', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => 'SID: "abc.def"' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 501, message: 'blocked' }) }))
    await expect(translateYandex({ text: 'hi', from: 'en', to: 'fr' })).rejects.toThrow(/501/)
  })
})
```

**Step 2: 验证失败**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/yandex.test.ts`
Expected: FAIL

**Step 3: 最小实现**

```ts
// src/utils/host/translate/api/yandex.ts
export interface YandexInput { text: string, from: string, to: string }
export interface YandexOutput { text: string }

let sidCache: { sid: string, fetchedAt: number } | null = null
const TTL = 30 * 60_000

async function fetchSid(): Promise<string> {
  if (sidCache && Date.now() - sidCache.fetchedAt < TTL)
    return sidCache.sid
  const res = await fetch('https://translate.yandex.com/')
  const html = await res.text()
  const m = html.match(/SID:\s*['"]([^'"]+)['"]/)
  if (!m)
    throw new Error('Yandex SID not found')
  const sid = m[1].split('.').reverse().join('.')
  sidCache = { sid, fetchedAt: Date.now() }
  return sid
}

export async function translateYandex(input: YandexInput): Promise<YandexOutput> {
  const sid = await fetchSid()
  const url = `https://translate.yandex.net/api/v1/tr.json/translate?srv=tr-text&id=${sid}-0-0&lang=${input.from}-${input.to}`
  const body = new URLSearchParams({ text: input.text, options: '4' })
  const res = await fetch(url, { method: 'POST', body })
  const data = await res.json() as { code: number, text?: string[], message?: string }
  if (data.code !== 200)
    throw new Error(`Yandex translate error ${data.code}: ${data.message ?? ''}`)
  return { text: data.text?.[0] ?? '' }
}
```

**Step 4: 测试通过**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/yandex.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/host/translate/api/yandex.ts src/utils/host/translate/api/__tests__/yandex.test.ts
git commit -m "feat(translate): add Yandex web translation provider"
```

---

## Task 4: LibreTranslate provider（可配置 endpoint）

**Files:**

- Create: `src/utils/host/translate/api/libre.ts`
- Create: `src/utils/host/translate/api/__tests__/libre.test.ts`

**Step 1: 写失败测试**

```ts
// src/utils/host/translate/api/__tests__/libre.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translateLibre } from '../libre'

describe('translateLibre', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POSTs to configured endpoint and returns translation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ translatedText: 'hola' }) })
    vi.stubGlobal('fetch', fetchMock)
    const out = await translateLibre({ text: 'hi', from: 'en', to: 'es', endpoint: 'https://example.com/translate' })
    expect(out.text).toBe('hola')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/translate',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('passes api_key when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ translatedText: 'x' }) })
    vi.stubGlobal('fetch', fetchMock)
    await translateLibre({ text: 'a', from: 'en', to: 'de', endpoint: 'https://e/t', apiKey: 'K' })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.api_key).toBe('K')
  })
})
```

**Step 2: 验证失败**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/libre.test.ts`
Expected: FAIL

**Step 3: 最小实现**

```ts
// src/utils/host/translate/api/libre.ts
export interface LibreInput { text: string, from: string, to: string, endpoint: string, apiKey?: string }
export interface LibreOutput { text: string }

export async function translateLibre(input: LibreInput): Promise<LibreOutput> {
  const body: Record<string, string> = { q: input.text, source: input.from, target: input.to, format: 'text' }
  if (input.apiKey)
    body.api_key = input.apiKey
  const res = await fetch(input.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw new Error(`LibreTranslate HTTP ${res.status}`)
  const data = await res.json() as { translatedText?: string, error?: string }
  if (data.error)
    throw new Error(`LibreTranslate: ${data.error}`)
  return { text: data.translatedText ?? '' }
}
```

**Step 4: 测试通过**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/libre.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/host/translate/api/libre.ts src/utils/host/translate/api/__tests__/libre.test.ts
git commit -m "feat(translate): add LibreTranslate provider"
```

---

## Task 5: 调度器集成 + 自动回退链

**Files:**

- Modify: `src/utils/host/translate/api/index.ts`（整合 health tracker + 回退顺序）
- Create: `src/utils/host/translate/api/__tests__/dispatch.test.ts`

**Step 1: 先读现有 index.ts 了解当前调度逻辑**

Run: `cat src/utils/host/translate/api/index.ts`
（Read 工具查看；注意保留原有 API 签名）

**Step 2: 写失败测试（scheduler 测试）**

```ts
// src/utils/host/translate/api/__tests__/dispatch.test.ts
import { describe, expect, it, vi } from 'vitest'
import { dispatchFreeTranslate } from '../index'

describe('dispatchFreeTranslate', () => {
  it('falls back to next provider when first fails', async () => {
    const google = vi.fn().mockRejectedValue(new Error('429'))
    const bing = vi.fn().mockResolvedValue({ text: 'ok' })
    await expect(
      dispatchFreeTranslate(
        { text: 'hi', from: 'en', to: 'zh-CN' },
        { order: ['google', 'bing'], impls: { google, bing } },
      ),
    ).resolves.toEqual({ text: 'ok', usedProvider: 'bing' })
  })

  it('skips providers marked unhealthy', async () => {
    const google = vi.fn()
    const bing = vi.fn().mockResolvedValue({ text: 'ok' })
    const health = { isHealthy: (k: string) => k !== 'google', recordFailure: vi.fn(), recordSuccess: vi.fn() }
    await dispatchFreeTranslate(
      { text: 'hi', from: 'en', to: 'zh-CN' },
      { order: ['google', 'bing'], impls: { google, bing }, health },
    )
    expect(google).not.toHaveBeenCalled()
  })
})
```

**Step 3: 验证失败**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/dispatch.test.ts`
Expected: FAIL

**Step 4: 最小实现**

在 `src/utils/host/translate/api/index.ts` 追加导出 `dispatchFreeTranslate`（不破坏原有导出），大致：

```ts
import type { ProviderKind } from './health'
import { createHealthTracker } from './health'

interface DispatchInput { text: string, from: string, to: string }
interface DispatchOptions {
  order: ProviderKind[]
  impls: Partial<Record<ProviderKind, (i: DispatchInput) => Promise<{ text: string }>>>
  health?: { isHealthy: (k: ProviderKind) => boolean, recordFailure: (k: ProviderKind) => void, recordSuccess: (k: ProviderKind) => void }
}

const defaultHealth = createHealthTracker()

export async function dispatchFreeTranslate(input: DispatchInput, opts: DispatchOptions) {
  const health = opts.health ?? defaultHealth
  let lastErr: unknown
  for (const k of opts.order) {
    if (!health.isHealthy(k))
      continue
    const fn = opts.impls[k]
    if (!fn)
      continue
    try {
      const out = await fn(input)
      health.recordSuccess(k)
      return { ...out, usedProvider: k }
    }
    catch (err) {
      health.recordFailure(k)
      lastErr = err
    }
  }
  throw lastErr ?? new Error('All free providers unhealthy')
}
```

**Step 5: 测试通过**

Run: `SKIP_FREE_API=true pnpm test src/utils/host/translate/api/__tests__/dispatch.test.ts`
Expected: PASS

**Step 6: 跑全量测试确认无回归**

Run: `SKIP_FREE_API=true pnpm test`
Expected: all pass (or unchanged failure count vs `main`)

**Step 7: Type check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors

**Step 8: Commit**

```bash
git add src/utils/host/translate/api/index.ts src/utils/host/translate/api/__tests__/dispatch.test.ts
git commit -m "feat(translate): add multi-provider dispatch with circuit breaker fallback"
```

---

## Task 6: 在 options 页面暴露新 provider 选择

**Files:**

- Modify: `src/entrypoints/options/` 内的 translate provider 设置 UI（具体文件需先读 `src/entrypoints/options/AGENTS.md`）
- Modify: `src/utils/config/` zod schema 中 `freeProvider` 枚举，新增 `'bing' | 'yandex' | 'libre'`
- Modify: `src/utils/config/migration-scripts/` 增加一条迁移 script，旧配置默认 `google`

**Step 1: 读 config schema 找到 `freeProvider` 定义**

Run Grep: `pattern: "freeProvider", type: "ts", glob: "src/utils/config/**"`

**Step 2: 写迁移脚本测试 + schema 测试**

参考 `src/utils/config/migration-scripts/__tests__/` 下已有迁移测试的模式，确保 `migrate(oldConfig)` 不丢字段、`freeProvider` 默认值合法。

**Step 3: 扩展 schema，添加迁移**

**Step 4: 改 options 页 Combobox**

**Step 5: 本地跑 `pnpm dev` 肉眼验证 options 页能选中 Bing/Yandex/Libre，切换后页面翻译生效**

**Step 6: Commit**

```bash
git commit -m "feat(options): expose Bing/Yandex/Libre free translation providers"
```

---

## M1 验收标准

- [ ] `SKIP_FREE_API=true pnpm test` 全绿，新增测试 ≥ 10 条
- [ ] `pnpm type-check` 无错
- [ ] `pnpm lint` 无错
- [ ] 开发版可在 options 页切换到 Bing / Yandex / Libre 并翻译成功
- [ ] 断网 + Google 失败模拟后自动回退到其他可用 provider
- [ ] 连续 3 次失败后 provider 被熔断 30 秒
- [ ] Changeset 记录加入 `.changeset/`

---

## 后续里程碑接入方式

每个后续里程碑（M2–M6）开工前：

1. 新 worktree：`git worktree add ../read-frog-m2-input-translate -b feat/input-translate`
2. 在新 worktree 运行 `/superpowers:brainstorming`，细化需求
3. 运行 `/superpowers:writing-plans`，产出 `docs/plans/YYYY-MM-DD-<milestone>.md`
4. 选择执行模式（subagent-driven / parallel session）

**不要**在同一个 worktree 里连续推进多个里程碑 —— 每个都走独立分支 + 独立 plan。
