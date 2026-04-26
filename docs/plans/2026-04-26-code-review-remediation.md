# Code Review 修复实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 [`CODE_REVIEW.md`](../../CODE_REVIEW.md) 列出的 12 个 critical / 24 个 high / 28 个 medium / 8 个 low 收敛掉，分三个 Phase 推进；Phase 0 是发版 blocker，Phase 1 是用户可感知风险，Phase 2 是工程债。

**Architecture:** 每条修复 = 一次 commit；每次 commit 必须附带 vitest 用例（除非显式标 "no test"）；本计划只覆盖 `apps/extension`，不动 `apps/api` / `apps/web` / `packages/*`。

**Tech Stack:** WXT 0.20.22 · React 19 · vitest 4 · jsdom 29 · TanStack Query 5 · Jotai 2 · Dexie 4 · `@webext-core/messaging` 2.

**前置条件:**
- 当前 worktree `feature/trusting-murdock-720dd8`
- `pnpm install --frozen-lockfile` 已执行
- `cd apps/extension` 内可独立运行 `pnpm test` / `pnpm type-check` / `pnpm lint`

**测试策略:**
- TDD：先写 vitest 用例 → 跑红 → 写最小实现 → 跑绿 → commit
- 每个 critical / high 任务都至少 1 个 vitest 用例
- 整 phase 完成后跑 `pnpm -r test && pnpm -r type-check && pnpm -r lint`
- 不引入新依赖（除非任务显式批准）

**Commit 风格（遵循 commitlint config-conventional + repo 现状）:**
- `fix(extension): <chinese-or-english summary>`
- 一个发现 = 一个 commit
- 不写 Co-Authored-By（仓库 settings 已禁用 attribution）

---

## Phase 0 — Release Blockers（必修）

### Task 0.1 — Critical C-1: 翻译结果改用 textContent，关闭 innerHTML XSS 入口

**Files:**
- Modify: `apps/extension/src/utils/host/translate/core/translation-modes.ts:302`
- Test: `apps/extension/src/utils/host/translate/core/__tests__/translation-modes-xss.test.ts` (Create)

**背景**: Reviewer C 与 E 独立指认 [`translation-modes.ts:302`](../../apps/extension/src/utils/host/translate/core/translation-modes.ts) 的 `translatedWrapperNode.innerHTML = translatedText` 把 LLM 返回字符串直接进 DOM。Translation-Only 模式被打穿；Bilingual 模式走 `textContent` 已安全。

**Step 1: 写 failing test**

```ts
// apps/extension/src/utils/host/translate/core/__tests__/translation-modes-xss.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/host/translate/translate-text", () => ({
  translateTextForPage: vi.fn(),
}))

import { translateTextForPage } from "@/utils/host/translate/translate-text"
import { translateNodeTranslationOnlyMode } from "../translation-modes"

describe("translation-only mode XSS", () => {
  it("does not execute payloads embedded in translated text", async () => {
    ;(window as any).__xss = false
    vi.mocked(translateTextForPage).mockResolvedValue(
      "<img src=x onerror=\"window.__xss=true\">",
    )
    const node = document.createElement("p")
    node.textContent = "hello"
    document.body.append(node)

    await translateNodeTranslationOnlyMode(node /* … 其余参数按现有签名补齐 */)

    // micro-task drain
    await new Promise(r => setTimeout(r, 0))
    expect((window as any).__xss).toBe(false)
    expect(node.querySelector("img")).toBeNull()
  })
})
```

**Step 2: 跑红**

`pnpm --filter @getu/extension test src/utils/host/translate/core/__tests__/translation-modes-xss.test.ts`

预期: FAIL（`window.__xss` 变 true 或 `<img>` 存在）

**Step 3: 最小实现** —— 把第 302 行 `translatedWrapperNode.innerHTML = translatedText` 改为 `translatedWrapperNode.textContent = translatedText`。

**Step 4: 跑绿** + 全量 `pnpm --filter @getu/extension test`（确保未破坏 bilingual / 其它路径）

**Step 5: Commit**

```
fix(extension): 翻译结果改用 textContent，关闭 innerHTML XSS

- translation-modes.ts:302: innerHTML → textContent
- 新增 vitest 用例覆盖 onerror payload 不会执行
- 修复 CODE_REVIEW.md C-1 / X1（Reviewer C+E 独立指认）
```

---

### Task 0.2 — Critical C-2: 翻译还原改用节点引用，移除 innerHTML round-trip

**Files:**
- Modify: `apps/extension/src/utils/host/translate/dom/translation-cleanup.ts:40` 与对应 snapshot 写入处 `translation-modes.ts:178,252`
- Modify: `apps/extension/src/utils/host/translate/core/translation-state.ts:5`（Map value 类型变更）
- Test: `apps/extension/src/utils/host/translate/dom/__tests__/translation-cleanup-restore.test.ts` (Create)

**改动**: `originalContentMap: Map<Element, string>` → `Map<Element, ChildNode[]>`；snapshot 时 `Array.from(el.childNodes)` 浅复制；还原时 `el.replaceChildren(...savedNodes)`，不再字符串化 HTML。

**Step 1: 测试** — snapshot/restore 不会改变事件监听器引用 / 不会重解析任意标记。

**Step 2: 跑红 → Step 3: 实现 → Step 4: 跑绿。**

**Step 5: Commit:** `fix(extension): 翻译快照保留节点引用，移除 innerHTML round-trip`

---

### Task 0.3 — Critical C-3: backgroundFetch 加 origin allowlist + sender 校验

**Files:**
- Modify: `apps/extension/src/entrypoints/background/proxy-fetch.ts:88-191`
- Create: `apps/extension/src/entrypoints/background/__tests__/proxy-fetch-allowlist.test.ts`
- Refer: `apps/extension/src/utils/constants/proxy-fetch.ts`（新增 `ALLOWED_PROXY_ORIGINS` 常量）

**Allowlist 候选**（向后兼容，需要再扫 caller）:
- `API_URL`（`@getu/definitions`）
- `WEBSITE_URL`
- 用户配置的 provider `baseURL`（runtime 注入：从 `configAtom.providers[].baseURL` 抽取）
- `accounts.google.com`（OAuth）
- 已知免费翻译 endpoint

**Step 1-5:**
1. test：传 `http://attacker/` 期望 reject + log；传 allowlist 内 URL 期望 fetch 被调用
2. 跑红
3. 实现：
   - 引入 `isAllowedProxyOrigin(url, runtimeAllowlist): boolean`
   - handler 入口 `if (sender.id !== chrome.runtime.id) throw`
   - 拒绝时返回 `{ success: false, error: "URL not in allowlist" }` 不抛
   - 删除 `logger.info("[ProxyFetch] Background fetch:", message.data)` 与 `logger.info("[ProxyFetch] Response without cache:", result)`，改为 `logger.debug({url, method, status})`
4. 跑绿
5. commit `fix(extension): proxy-fetch 加 URL 白名单 + sender 校验`

---

### Task 0.4 — Critical C-4: openPage 加 URL scheme/origin 校验

**Files:**
- Modify: `apps/extension/src/entrypoints/background/index.ts:47-51`
- Create: `apps/extension/src/entrypoints/background/__tests__/open-page-validation.test.ts`

**实现**:
```ts
onMessage("openPage", async ({ data, sender }) => {
  if (sender.id !== chrome.runtime.id) return
  let parsed: URL
  try { parsed = new URL(data.url) } catch { return }
  const allowedSchemes = new Set(["https:", "http:"])  // http for LAN providers
  const allowedHosts = [...OFFICIAL_SITE_URL_PATTERNS, API_URL_HOST, /* … */]
  if (!allowedSchemes.has(parsed.protocol)) return
  if (!allowedHosts.some(h => matchHost(parsed.host, h))) return
  await browser.tabs.create({ url: data.url })
})
```

**Test cases**：`javascript:`、`data:`、`chrome-extension://`、随机外站 → 拒；`https://getutranslate.com/...` → 允许。

Commit: `fix(extension): openPage 校验 scheme + host allowlist`

---

### Task 0.5 — Critical C-5 + C-12: 翻译队列消息处理器同步注册 + queueReady 守卫

**Files:**
- Modify: `apps/extension/src/entrypoints/background/translation-queues.ts:1-301`
- Modify: `apps/extension/src/entrypoints/background/index.ts:96-97`
- Create: `apps/extension/src/entrypoints/background/__tests__/translation-queue-cold-start.test.ts`

**重构**:
```ts
// translation-queues.ts 顶层
let webPageQueueReady: Promise<{ requestQueue: RequestQueue, batchQueue: BatchQueue }>
  | null = null

export function registerWebPageTranslationHandlers() {
  // 同步注册 stub
  onMessage("enqueueTranslateRequest", async (msg) => {
    const queues = await (webPageQueueReady ??= initWebPageTranslationQueue())
    return queues.batchQueue.add(msg.data, /* … */)
  })
  // 同步注册其它 5 个
}

async function initWebPageTranslationQueue() { /* 原 setUpWebPageTranslationQueue 内部 */ }
```

`index.ts` 中改为 `registerWebPageTranslationHandlers()`（同步，无 void）。

**Test cases**：
- 启动顺序：模拟 `chrome.runtime.onMessage` 在 `await ensureInitializedConfig()` 解析前 fire → 不应丢消息
- `init` 失败 → handler 重试（`webPageQueueReady = null`）

Commit: `fix(extension): 翻译队列 handler 同步注册，修复 SW 冷启动 race`

---

### Task 0.6 — Critical C-6: 翻译队列 SW 保活 + 错误回传

**Files:**
- Modify: `apps/extension/src/utils/request/batch-queue.ts:107`、`request-queue.ts:118`
- Modify: `apps/extension/src/entrypoints/background/translation-queues.ts`
- Modify: `apps/extension/src/utils/content-script/background-fetch-client.ts`（caller 端）

**最小修复**（不引入持久化）：
1. 当 `pendingBatchMap.size > 0` 时启用 `chrome.alarms` 1-min 保活（最小允许间隔）
2. SW restart 时 stub handler 收到入队请求若发现队列已空且无 `queueReady` → 立即 init 并入队
3. content-script 端：`backgroundFetch-client` 把"connection lost"分类为可重试错误，触发 retry（最多 1 次）

**Test**：模拟 SW evict → 重新唤醒 → 同一片段拿到结果。

Commit: `fix(extension): 翻译队列 SW 保活 + content-script 重试`

---

### Task 0.7 — Critical C-7: setUpConfigBackup 加 alarm 守卫

**Files:**
- Modify: `apps/extension/src/entrypoints/background/config-backup.ts:13`
- Test: `apps/extension/src/entrypoints/background/__tests__/config-backup-alarm.test.ts` (Create)

**实现**：拷贝 `db-cleanup.ts:24` 模式：
```ts
const existing = await browser.alarms.get(CONFIG_BACKUP_ALARM)
if (!existing) {
  browser.alarms.create(CONFIG_BACKUP_ALARM, { delayInMinutes: 1, periodInMinutes: 60 })
}
```

**Test**：调用两次 `setUpConfigBackup`，第二次 `browser.alarms.create` 不被调；通过 mock `browser.alarms.get` / `.create` 计数验证。

Commit: `fix(extension): config-backup alarm 加 existing 守卫，避免每次 SW 重启重置倒计时`

---

### Task 0.8 — Critical C-8: storageAdapter.watch 处理 null 通知

**Files:**
- Modify: `apps/extension/src/utils/atoms/storage-adapter.ts:14-34`
- Test: `apps/extension/src/utils/atoms/__tests__/storage-adapter-watch-null.test.ts` (Create)

**API 变更**：`watch` 已收 `fallback`（通过 `defineItem` defaults），改为：
```ts
watch: (callback) => storage.watch<T>(key, (newValue) => {
  callback(isNonNullish(newValue) ? newValue : fallback)
}),
```
（如果 closure 拿不到 fallback，`createStorageAdapter` 接收 fallback 参数）

**Test**：模拟 `storage.watch` fire null → callback 收到 `fallback`。

Commit: `fix(extension): storageAdapter.watch 在 null 时回退默认值`

---

### Task 0.9 — Critical C-9: lifecycleGuard 改 WeakMap

**Files:**
- Modify: `apps/extension/src/utils/extension-lifecycle.ts:114`

**改动**：模块级 `lifecycleGuardInstalled: boolean` → `WeakMap<Window, Set<string>>`；判断 `if (set.has(scriptName)) return`。

Commit: `fix(extension): lifecycle guard 改 WeakMap，区分多 content script`

---

### Task 0.10 — Critical C-10: interceptor XHR 还原 + LRU

**Files:**
- Modify: `apps/extension/src/entrypoints/interceptor.content/timedtext-observer.ts:1-61`

**改动**:
1. 加 `setupCalled` idempotent guard
2. `pagehide` listener 还原 `XMLHttpRequest.prototype.{open,send}`
3. `timedtextUrlCache` LRU 上限 5
4. 在 `open` 调用时 URL 不匹配 `api/timedtext` 直接返回原始函数（不打 `load` listener）

**Test**：mock 多次 init → 仅一次 prototype 替换；`pagehide` 触发后 prototype identity 与备份相等。

Commit: `fix(extension): interceptor XHR 加 idempotent + pagehide 还原 + LRU`

---

### Task 0.11 — Critical C-11: upgrade-success 加 ErrorBoundary + 服务端会话校验

**Files:**
- Modify: `apps/extension/src/entrypoints/upgrade-success/main.tsx:1-100`
- 可能需要：`packages/contract` 加 `verifyCheckoutSession` endpoint（**先确认是否已存在**）

**Step 1: 包 RecoveryBoundary**（与 popup/options 一致）

**Step 2: 接受 `?session_id=...` 参数**，调 `orpcClient.billing.verifyCheckoutSession({sessionId})`，无 / 验证失败则显示中性"checking..." UI 而非 confetti。

**注意**：若后端 endpoint 不存在，本任务拆为：
- 0.11a：FE 包 RecoveryBoundary（立即可做）
- 0.11b：BE 加 endpoint + FE 接入（独立 PR，跨 app）

Commit: `fix(extension): upgrade-success 包 RecoveryBoundary + 服务端会话校验`

---

### Task 0.12 — High H-1: 移除 includeSources 中的 .env.production

**Files:**
- Modify: `apps/extension/wxt.config.ts:87`

**改动**: `includeSources: [".env.production"]` → `includeSources: []`（或彻底删字段）。同时在 `BUILD.md`（新建）记录 AMO 审核员需要的 env 变量名（不含值）。

**Test**：CI 加步骤 `unzip -l output/*-sources.zip | grep -q '\.env\.production' && exit 1 || exit 0`（移到 `.github/workflows/release.yml`）。

Commit: `fix(extension): 不再把 .env.production 打进 AMO source zip`

---

### Phase 0 完成后

```bash
pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension lint
git log --oneline feature/trusting-murdock-720dd8 ^origin/main  # 应有 12 个 commit
```

派 `code-reviewer` subagent 复审 Phase 0 的所有 commit，确认无 regression。

---

## Phase 1 — High（用户可感知风险）

> 任务模板缩简：每条仍是 TDD（除标 "no test"），但不重复展开 Step 1-5；遇到不确定项时先读相关源文件再写 test。

### Task 1.1 — H-2: check-api-key-env 扩展 regex + 非 zip 也跑

`apps/extension/wxt.config.ts:113-158`
- regex `WXT_.*API_KEY` → `WXT_(?!POSTHOG_API_KEY$).*` 反向白名单
- 把 `WXT_ZIP_MODE` gate 内的 optional warning 挪到所有 production build
- 新增 vitest 单测调用 `buildStart` with mock `process.env`

Commit: `fix(extension): wxt build 期 secret 拦截规则扩展到所有 WXT_* 变量`

### Task 1.2 — H-3: vitest 默认 jsdom

`apps/extension/vitest.config.ts:12` → `environment: "jsdom"`；纯 background/util 测试加 `// @vitest-environment node` 头。
- 跑全量测试，修复因切环境产生的失败用例（应不多，因为 setup.ts 已 polyfill）
- 加 canary `test("dom is available", () => expect(document).toBeInstanceOf(Document))`

Commit: `test(extension): vitest 默认 jsdom，content script 测试从此跑在 DOM 中`

### Task 1.3 — H-4: 加 coverage 阈值 + CI 改 test:cov

- `vitest.config.ts` 加 `test.coverage.thresholds.lines = 60` 等
- `.github/workflows/pr-test.yml`：`pnpm test` → `pnpm test:cov`
- 文档化"如何降低阈值需 PR 评审"
- no test（基础设施）

Commit: `ci(extension): 启用 vitest coverage 阈值`

### Task 1.4 — H-5: HTTP provider URL UI 警告

`apps/extension/src/components/llm-providers/**`：用户输入 `http://` 且 host 非 `localhost` / `127.0.0.1` 时显示 inline warning。

Commit: `feat(extension): 非 localhost HTTP provider URL 显示明文传输警告`

### Task 1.5 — H-6: 删 host_permissions 冗余项

`apps/extension/wxt.config.ts:49-58` 删除被 `*://*/*` 覆盖的 5 个具体域名。
- no test

Commit: `chore(extension): 移除被通配符覆盖的 host_permissions 重复项`

### Task 1.6 — H-7: cookies 权限范围最小化（评估 → 决策）

先做评估：grep 全部 `cookies.` 调用点；若仅 `proxy-fetch.ts` 一处缓存失效，尝试用 `webRequest` 替代。
- 若可移除：删 `cookies` 权限并提交
- 若不可：在代码注释 + `apps/extension/AGENTS.md` 文档化

Commit: `chore(extension): 移除 cookies 权限` 或 `docs(extension): 记录 cookies 权限范围`

### Task 1.7 — H-8: pre-commit 加 type-check

`.husky/pre-commit` 加 `pnpm --filter @getu/extension type-check`（或集成到 lint-staged）
- no test

Commit: `chore(husky): pre-commit 强制 type-check`

### Task 1.8 — H-9: pin-state 改 alarm

`apps/extension/src/entrypoints/background/new-user-guide.ts:24`：
- 删除 `setInterval` Firefox fallback
- 用 `chrome.alarms.create("rf-pin-poll", { periodInMinutes: 1 })` + `onAlarm` 处理
- Firefox 不支持时整功能跳过 + 文档化

Commit: `fix(extension): pin-state 轮询改用 chrome.alarms`

### Task 1.9 — H-10: iframe 注入 dedup 改 in-page sentinel

`apps/extension/src/entrypoints/background/iframe-injection.ts:7-100`：
- 移除模块级 Set/Map
- 注入前用 `executeScript` 探测 `window.__READ_FROG_SELECTION_INJECTED__` / `window.__READ_FROG_HOST_INJECTED__`
- 已 set → skip

Commit: `fix(extension): iframe 注入 dedup 改用 in-page sentinel，跨 SW restart 安全`

### Task 1.10 — H-11: PDF tab Set 用 chrome.storage.session 持久化

`apps/extension/src/entrypoints/background/pdf-tab-detect.ts:10`：
- in-memory Set → `chrome.storage.session.get/set("pdfTabIds")`
- SW startup 时 `chrome.tabs.query({})` + URL 后缀回填

Commit: `fix(extension): PDF tab 检测状态用 storage.session 持久化`

### Task 1.11 — H-12: addBackup 串行化（mutex）

`apps/extension/src/utils/backup/storage.ts:74-96`：
- 加模块级 `let lock: Promise<void> = Promise.resolve()`；`addBackup` 内 `await (lock = lock.then(realAdd))`
- 同样改造 `removeBackup`

测试：并发 100 个 addBackup → 无 ID 丢失。

Commit: `fix(extension): backup 列表读改写串行化，避免并发数据丢失`

### Task 1.12 — H-13: port-streaming async listener outer try/catch

`apps/extension/src/entrypoints/background/background-stream.ts:135`：在 `messageListener` 外层 try/catch，错误时 `safePost({type:"error", error: extractMessage(err)})` 再 cleanup。

Commit: `fix(extension): port-streaming 顶层 catch 把 setup 错误回传给 client`

### Task 1.13 — H-14: Drive token 切 storage.session（短期）

`apps/extension/src/utils/google-drive/auth.ts:94`：
- `storage.setItem("local:google_drive_token", ...)` → `storage.setItem("session:google_drive_token", ...)`
- 需检查 `storage` 抽象是否支持 session；若不支持直接 `chrome.storage.session`
- 长期改 PKCE 单独立 ticket（**不在本计划内**）

Commit: `fix(extension): Drive 访问令牌改存 session storage（短期缓解）`

### Task 1.14 — H-15: entitlements 实时同步

`apps/extension/src/hooks/use-entitlements.ts:114-118`：去掉 `!query.data.isFromCache` 守卫。
- Test：mock cache return → atom 仍同步

Commit: `fix(extension): entitlements atom 不忽略 cached query 结果`

### Task 1.15 — H-16: TranslationCard 接 AbortController

`apps/extension/src/entrypoints/translation-hub/components/translation-card.tsx:40-68`：
- `useRef<AbortController | null>(null)`
- 新请求前 `controller.current?.abort(); controller.current = new AbortController()`
- 把 signal 传到 `executeTranslate` 与 `streamText`/`generateText`

Commit: `fix(extension): TranslationCard 接 AbortController 取消旧请求`

### Task 1.16 — H-17: configAtom / themeAtom onMount 加 document guard

`apps/extension/src/utils/atoms/config.ts:136-144` 与 `theme.ts:34-41`：
```ts
if (typeof document === "undefined") return
document.addEventListener("visibilitychange", handler)
```
- Test：jest-environment node 下 `import("@/utils/atoms/config")` 不抛

Commit: `fix(extension): atom onMount 加 document guard，兼容 background/offscreen 上下文`

### Task 1.17 — H-18: blog notification queries 加 staleTime / retry / suppressToast

`apps/extension/src/entrypoints/popup/components/blog-notification.tsx:14-22`：
```ts
useQuery({
  queryKey: [...],
  queryFn: ...,
  staleTime: 1000 * 60 * 60 * 24, // ONE_DAY_MS
  retry: false,
  meta: { suppressToast: true },
})
```

Commit: `fix(extension): popup 博客通知 query 加 staleTime + 静默错误`

### Task 1.18 — H-19: QueryCache.onError 仅最终失败弹 toast

`apps/extension/src/utils/tanstack-query.ts:5-16`：判断 `query.state.fetchStatus === "idle"` 才弹。
- Test：mock retry 3 次 → 仅 1 toast

Commit: `fix(extension): TanStack Query 全局错误 toast 仅在最终失败时弹`

### Task 1.19 — H-20: subtitles UniversalAdapter navigation listener cleanup

`apps/extension/src/entrypoints/subtitles.content/universal-adapter.ts:197-207`：
- `setupNavigationListeners` 返回 `() => {...}` cleanup
- `bootstrapSubtitlesRuntime` 在 `ctx.onInvalidated` 调用

Commit: `fix(extension): UniversalVideoAdapter navigation listener 加 cleanup`

### Task 1.20 — H-21: history.pushState patch 防重入

`apps/extension/src/entrypoints/host.content/listen.ts:36-43`：
- `if ((history.pushState as any).__rfPatched) return`
- 设 `wrapper.__rfPatched = true`

Commit: `fix(extension): host.content history.pushState patch idempotent`

### Task 1.21 — H-22: 翻译 MutationObserver 防自递归

`apps/extension/src/entrypoints/host.content/translation-control/page-translation.ts:491-522`：
- 加 `isProcessingMutation: boolean` flag
- 进 callback 设 true，microtask 末 reset

Commit: `fix(extension): page translation MutationObserver 防自递归`

### Task 1.22 — H-23: side.content 调用 protectInternalStyles 返回值

`apps/extension/src/entrypoints/side.content/index.tsx`：
- `const cleanup = protectInternalStyles()` → `ctx.onInvalidated(cleanup)`

Commit: `fix(extension): side.content style protector 接 cleanup`

### Task 1.23 — H-24: guide.content postMessage origin + Zod 校验

`apps/extension/src/entrypoints/guide.content/index.ts:17,29,32-45`：
- 三处 `postMessage(msg, "*")` → `postMessage(msg, OFFICIAL_SITE_ORIGIN)`（基于 location.origin 校验后取）
- `langCodeISO6393` 用 `langCodeISO6393Schema.safeParse`

Commit: `fix(extension): guide.content postMessage 限定 origin + 校验输入`

### Task 1.24 — Phase 1 验收

```bash
pnpm -r test && pnpm -r type-check && pnpm -r lint
```
派 `code-reviewer` subagent 复审 Phase 1 commits。

---

## Phase 2 — Medium / Low（工程债，按需收敛）

> 不展开 TDD 模板；每条单独 issue/PR；可拆给不同人。

| ID | 文件:行 | 修复要点 | 估时 |
|---|---|---|---|
| M-1 | `wxt.config.ts:30-32` | dev key 加 `process.env.CI` guard + CI 校验产物无 `key` | 30m |
| M-2 | `wxt.config.ts:9-15` | regex 改 `/[﷐-﷯￾￿]/gu` + 高平面 nonchar | 30m |
| M-3 | `apps/extension/tsconfig.json` | 显式 `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`，修产生的 type error | 1-2d |
| M-4 | `wxt.config.ts:6-8` | 文档化 PostHog key 为公开值 + 服务端 ingest proxy（架构变更，独立 ticket） | 待评估 |
| M-5 | `.github/workflows/submit.yml:55-57` | `--edge-zip ...*-edge.zip`；先 `zip:edge` | 15m |
| M-6 | `proxy-fetch.ts` | logger redact `Authorization` / `Cookie` / cookie value（在 0.3 中已部分覆盖，此处补 cookies.onChanged 端） | 30m |
| M-7 | `llm-generate-text.ts:25-33` | sender 校验 + per-tab rate limit | 1h |
| M-8 | `timedtext-observer.ts` | `open` 中 URL 不匹配则不打 `load` listener | 30m |
| M-9 | `chart.tsx:78-95` | sanitize `key`/`color` 输入正则 | 30m |
| M-10 | `google-drive/storage.ts:28` | 远端 JSON `JSON.parse` 后用 `ConfigValueAndMetaSchema.safeParse` | 30m |
| M-11 | `storageAdapter.watch` callers | 审计所有调用点确保 `unwatch` 被消费 | 1h |
| M-12 | `backup/storage.ts:26-37` | 改 `storage.getItems(keys)` 单次读 | 15m |
| M-13 | `app-db.ts:167-203` | Dexie v11 migration `.stores({pdfTranslations:null,pdfTranslationUsage:null}).upgrade(tx => clear)` | 1h（含测试） |
| M-14 | `config.ts:6-14` | `configPromise.catch(() => { configPromise = null; logger.error })` | 15m |
| M-15 | `db-cleanup.ts:54-64` | 顶层同步注册 `alarms.onAlarm.addListener` | 30m |
| M-16 | `new-user-guide.ts:13` | once-flag 守卫 onMessage 重注册 | 15m |
| M-17 | `analytics.ts:132-255` | PostHog client cache 进 `chrome.storage.session` | 1h |
| M-18 | `subtitles/fetchers/youtube/index.ts:35-63` | `postMessageRequest` 接受 `AbortSignal` | 30m |
| M-19 | `timedtext-observer.ts:3-4` | `timedtextUrlCache` LRU（已在 0.10 部分覆盖） | 在 0.10 内合并 |
| M-20 | `iframe-injection.ts:93-100` | Firefox 无 documentId 走 tabId+frameId fallback（已在 1.9 改写后失效，但需验证） | 验证 |
| M-21 | `subtitles.content/runtime.ts:13-19` | `ctx.onInvalidated` 内 reset `hasBootstrappedSubtitlesRuntime` | 15m |
| M-22 | `translation-state.ts:5` | `stop()` 末尾 `originalContentMap.clear()` | 15m |
| M-23 | `upgrade-success/main.tsx:18-43` | `closeTimer` 改 `useRef` | 30m |
| M-24 | `input-field-auto-save.tsx:32` | 用 `useDebouncedValue(300ms)` | 30m |
| M-25 | `config.ts:101` | writeQueue `.catch` 加 `logger.error` | 10m |
| M-26 | `recovery-fallback.tsx:29` | 内嵌二级 ErrorBoundary 或读 storage 跳 atom | 1h |
| M-27 | `translation-state.ts atoms` | onMount 加 `didReceiveUpdate` flag | 30m |
| M-28 | `backup/storage.ts:80-96` | 写顺序调换：先 ID list 再数据 | 30m |
| L-1 | `popup/components/{review-entry-button,translate-current-pdf-button}.tsx` | `tabs.getCurrent` + `tabs.remove` fallback | 30m |
| L-2 | `atoms/{config,theme,detected-code,analytics}.ts` | `console.error` → `logger.error` | 15m |
| L-3 | (与 M-10 重复，dedup 删除) | — | — |
| L-4 | `hash.ts` | 文档化威胁模型 | 30m |
| L-5 | `proxy-fetch.ts:37` | 如有 race 接受当前实现，文档化 | 0 |
| L-6 | `context-menu.ts:113` | 平台限制可接受，文档化 | 0 |
| L-7 | `side.content` | disconnect vs lifecycle 错误分类细化 | 1h |
| L-8 | `guide.content:20-47` | listener 内 try/catch | 15m |

### Phase 2 验收

按周节奏推进；每解决 5 个 commit 一个 PR；每个 PR 派 `code-reviewer` 复审。

---

## 验收 / Definition of Done

- [ ] Phase 0 全 12 个 commit 落地、`pnpm -r test && pnpm -r type-check && pnpm -r lint` 全绿
- [ ] Phase 0 经 code-reviewer 子代理复审通过
- [ ] Phase 1 全 24 个 commit 落地，CI 跑 `pnpm test:cov` 且 lines/functions ≥ 60%
- [ ] Phase 2 进入 backlog（issue tracker），优先级与 owner 标注
- [ ] [`CODE_REVIEW.md`](../../CODE_REVIEW.md) 已 updated 标注每条状态（fixed/wontfix/deferred）
- [ ] 一份 RELEASE_NOTES 草稿列出 critical 修复（向 store 审核员 / Pro 用户）

---

## 附录 — 引用 skill

- 实施时使用 [`superpowers:executing-plans`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/executing-plans) 跨任务推进
- 每个 critical / high commit 后用 [`superpowers:requesting-code-review`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/requesting-code-review) 派 code-reviewer subagent
- 验证步骤用 [`superpowers:verification-before-completion`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/verification-before-completion)

