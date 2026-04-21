# M3 · PR #A — PDF viewer 接管 + 基础渲染 · 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-21-m3-pdf-translate-design.md`
> **Parent roadmap:** `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md` → M3

**Goal:** 装完扩展能用自建 pdf.js viewer 打开 `.pdf`（在线 + `file://`），首次询问用户是否接管，"永不"持久化。暂无翻译功能（PR #B 做）。

**Architecture:** 新增 WXT HTML entrypoint `pdf-viewer/` → 以 `pdfjs-dist` 的 `web/viewer.html` 为基础自包一份；背景脚本 `pdf-redirect.ts` 监听 `webNavigation.onBeforeNavigate`，命中 `.pdf` 扩展名且模式为 "ask/always" 时 redirect 到 `pdf-viewer/index.html?src=<url>`；popup 增加"翻译当前 PDF"按钮作为手动兜底；Options 新增 "PDF 翻译" Tab 管理偏好。

**Tech Stack:** WXT 0.20 · `pdfjs-dist` 4.x · React 19（复用 popup/options 组件）· Jotai · Dexie（后续 PR 用）· `webNavigation` API（已在 manifest permissions 中）

---

## Preconditions

- Worktree: `.claude/worktrees/m3-pdf-translate`，分支 `feat/m3-pdf-translate`
- `pnpm install` 完成；baseline `SKIP_FREE_API=true pnpm test` 全绿（1158 passing + 4 skipped）
- 已读：
  - `apps/extension/src/entrypoints/background/AGENTS.md`（MV3 同步注册约束）
  - `apps/extension/src/entrypoints/options/AGENTS.md`（HashRouter + nav-items.ts）
  - `apps/extension/src/utils/config/migration-scripts/v058-to-v059.ts`（migration 是冻结快照，禁止 import 常量）
  - `apps/extension/src/utils/site-control.ts`（blocklist/whitelist 现有模式）
  - `apps/extension/src/types/config/config.ts` 的 `inputTranslationSchema`（作为 `pdfTranslationSchema` 的模板）
- 当前 schema 最新版本：`v069`（见 `utils/config/migration-scripts/` 目录），PR #A 新建 `v069-to-v070.ts`

## Delivery

**单个 PR**：`feat/m3-pdf-translate` → `main`，最终合入时 rebase + squash。
**验收前**：`codex:adversarial-review` 复核。

---

## Task 1: 新增 `pdf` 配置 schema + 迁移 v069→v070

**Goal:** 在 `Config` 类型新增 `pdf` 分支，默认模式 `ask`，blocklist 为空；迁移脚本将老 config 平滑加字段。

**Files:**

- Modify: `apps/extension/src/types/config/config.ts`（`inputTranslationSchema` 旁边加 `pdfTranslationSchema`）
- Modify: `apps/extension/src/utils/constants/config.ts`（`DEFAULT_CONFIG.pdfTranslation` + `schemaVersion` 升到 `70`）
- Create: `apps/extension/src/utils/config/migration-scripts/v069-to-v070.ts`
- Modify: `apps/extension/src/utils/config/migration-scripts/index.ts`（注册新 migration，顺序追加）
- Create: `apps/extension/src/utils/config/__tests__/example/v070.ts`（从 `v069.ts` 复制 + 加 `pdfTranslation` 字段）

**Schema shape:**

```ts
// types/config/config.ts
const pdfTranslationSchema = z.object({
  enabled: z.boolean(),                                        // 全局开关
  activationMode: z.enum(["ask", "always", "manual"]),         // E2 的三选一
  blocklistDomains: z.array(z.string()),                       // 选"永不"的域名
  allowFileProtocol: z.boolean(),                              // file:// 权限引导状态（user 勾选过即 true）
})
export type PdfTranslationConfig = z.infer<typeof pdfTranslationSchema>

// configSchema 里加 pdfTranslation 字段
```

**Default:**

```ts
// constants/config.ts — DEFAULT_CONFIG 里追加
pdfTranslation: {
  enabled: true,
  activationMode: "ask",
  blocklistDomains: [],
  allowFileProtocol: false,
},
```

**Migration (frozen snapshot — NO imports):**

```ts
// v069-to-v070.ts
export function migrate(oldConfig: any): any {
  if (oldConfig.pdfTranslation)
    return oldConfig
  return {
    ...oldConfig,
    pdfTranslation: {
      enabled: true,
      activationMode: "ask",
      blocklistDomains: [],
      allowFileProtocol: false,
    },
  }
}
```

**Step 1: 写失败测试**

Create `apps/extension/src/utils/config/__tests__/v069-to-v070.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { migrate } from "../migration-scripts/v069-to-v070"
import { v069Example } from "./example/v069"

describe("migrate v069 → v070", () => {
  it("adds default pdfTranslation when missing", () => {
    const result = migrate(v069Example)
    expect(result.pdfTranslation).toEqual({
      enabled: true,
      activationMode: "ask",
      blocklistDomains: [],
      allowFileProtocol: false,
    })
  })

  it("preserves existing pdfTranslation (idempotent)", () => {
    const custom = { ...v069Example, pdfTranslation: { enabled: false, activationMode: "manual", blocklistDomains: ["evil.com"], allowFileProtocol: true } }
    expect(migrate(custom).pdfTranslation.activationMode).toBe("manual")
  })

  it("keeps all other fields untouched", () => {
    const result = migrate(v069Example)
    expect(result.inputTranslation).toEqual(v069Example.inputTranslation)
    expect(result.siteControl).toEqual(v069Example.siteControl)
  })
})
```

**Step 2: 验证失败**

```bash
pnpm --filter @getu/extension test -- config/__tests__/v069-to-v070.test.ts
```

Expected: FAIL — "Cannot find module '../migration-scripts/v069-to-v070'"

**Step 3: 实现**

写 `v069-to-v070.ts` + 更新 schema / DEFAULT_CONFIG / schemaVersion + 注册 migration。

**Step 4: 验证通过**

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
```

Expected: 新测试 3 passing；全量回归 0 failure。

**Step 5: Commit**

```bash
git commit -m "feat(config): add pdfTranslation schema + v070 migration (M3 PR#A Task 1)"
```

---

## Task 2: 新增 `pdf-viewer` WXT entrypoint 骨架

**Goal:** 装上扩展后访问 `chrome-extension://<id>/pdf-viewer.html?src=...` 能渲染 PDF（裸功能，无翻译）。

**Dependency:**

```bash
pnpm --filter @getu/extension add pdfjs-dist@^4
```

**Files:**

- Create: `apps/extension/src/entrypoints/pdf-viewer/index.html`（基础骨架，挂载 `#viewer-root`）
- Create: `apps/extension/src/entrypoints/pdf-viewer/main.ts`（初始化 `pdfjs-dist` 的 `PDFViewer`）
- Create: `apps/extension/src/entrypoints/pdf-viewer/style.css`（沿用 `pdfjs-dist/web/pdf_viewer.css`）
- Create: `apps/extension/src/entrypoints/pdf-viewer/AGENTS.md`（仿 background/AGENTS.md 格式）
- Modify: `apps/extension/wxt.config.ts` — `web_accessible_resources` 新增 `pdf-viewer.html`

**index.html:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Viewer | GetU Translate</title>
  </head>
  <body>
    <div id="viewer-container">
      <div id="viewer" class="pdfViewer"></div>
    </div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

**main.ts（最小可跑版）:**

```ts
import * as pdfjsLib from "pdfjs-dist"
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs"
import "pdfjs-dist/web/pdf_viewer.css"
import "./style.css"

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString()

async function boot() {
  const params = new URLSearchParams(location.search)
  const src = params.get("src")
  if (!src) {
    document.body.textContent = "Missing ?src= parameter"
    return
  }

  const container = document.getElementById("viewer-container")!
  const eventBus = new EventBus()
  const linkService = new PDFLinkService({ eventBus })
  const viewer = new PDFViewer({ container, eventBus, linkService })
  linkService.setViewer(viewer)

  const loadingTask = pdfjsLib.getDocument({ url: src, withCredentials: true })
  const pdfDoc = await loadingTask.promise
  viewer.setDocument(pdfDoc)
  linkService.setDocument(pdfDoc)
}

void boot()
```

**wxt.config.ts diff:**

```ts
web_accessible_resources: [
  {
    resources: ["assets/*.png", "assets/*.svg", "assets/*.webp", "pdf-viewer.html"],
    matches: ["*://*/*", "file:///*"],
  },
],
```

**Step 1: 写失败测试（单测 main.ts 的 src 解析）**

Create `apps/extension/src/entrypoints/pdf-viewer/__tests__/main.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseSrcParam } from "../main"  // 把 URLSearchParams 那段抽成纯函数

describe("parseSrcParam", () => {
  it("returns url when ?src= present", () => {
    expect(parseSrcParam("?src=https%3A%2F%2Fa.com%2Fx.pdf")).toBe("https://a.com/x.pdf")
  })
  it("returns null when missing", () => {
    expect(parseSrcParam("")).toBeNull()
  })
  it("returns null when src is empty", () => {
    expect(parseSrcParam("?src=")).toBeNull()
  })
})
```

**Step 2: 验证失败**

```bash
pnpm --filter @getu/extension test -- pdf-viewer/__tests__/main.test.ts
```

Expected: FAIL — module not found.

**Step 3: 实现**

写 `main.ts` 并 **export `parseSrcParam`** 作为纯函数；其他 pdf.js 初始化放在 `boot()` 里（测试里不调 boot）。

**Step 4: 验证测试通过 + dev 构建可跑**

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- pdf-viewer
pnpm --filter @getu/extension build
```

Expected: 测试 PASS；build 成功生成 `.output/chrome-mv3/pdf-viewer.html`。

**Step 5: 手动冒烟**

```bash
pnpm --filter @getu/extension dev
# 在 chrome://extensions 加载 .output/chrome-mv3-dev
# 访问 chrome-extension://<id>/pdf-viewer.html?src=<任意公开 PDF URL>
# 确认 PDF 渲染
```

**Step 6: Commit**

```bash
git add apps/extension/src/entrypoints/pdf-viewer apps/extension/wxt.config.ts apps/extension/package.json pnpm-lock.yaml
git commit -m "feat(pdf-viewer): scaffold pdfjs-dist viewer entrypoint (M3 PR#A Task 2)"
```

---

## Task 3: Background `pdf-redirect.ts` 拦截 `.pdf` 导航

**Goal:** 用户在地址栏输入 `*.pdf` / 点链接跳 PDF → 背景脚本拦截 → 根据 `pdfTranslation.activationMode` 决定 redirect 到自建 viewer。

**Files:**

- Create: `apps/extension/src/entrypoints/background/pdf-redirect.ts`
- Create: `apps/extension/src/entrypoints/background/__tests__/pdf-redirect.test.ts`
- Modify: `apps/extension/src/entrypoints/background/index.ts`（在 `main()` 内 `setUpPdfRedirect()`）

**核心逻辑（导出为纯函数以便测试）:**

```ts
// pdf-redirect.ts
export interface PdfRedirectDecision {
  action: "redirect" | "skip"
  viewerUrl?: string
}

export function decideRedirect(params: {
  targetUrl: string
  activationMode: "ask" | "always" | "manual"
  enabled: boolean
  blocklistDomains: string[]
  allowFileProtocol: boolean
  viewerOrigin: string   // chrome-extension://<id>
}): PdfRedirectDecision {
  // 1. enabled=false → skip
  // 2. activationMode='manual' → skip (popup 按钮才激活)
  // 3. file:// 且 allowFileProtocol=false → skip（Chrome 未勾权限）
  // 4. domain 命中 blocklist → skip
  // 5. 不是 .pdf 后缀 → skip
  // 6. else redirect to `${viewerOrigin}/pdf-viewer.html?src=${encodeURIComponent(targetUrl)}`
}
```

**注册方式（同步 addListener，MV3 约束）:**

```ts
// pdf-redirect.ts
import { browser } from "#imports"
import { ensureInitializedConfig } from "./config"

export function setUpPdfRedirect() {
  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return   // 只拦 top frame
    const config = await ensureInitializedConfig()
    const decision = decideRedirect({
      targetUrl: details.url,
      activationMode: config.pdfTranslation.activationMode,
      enabled: config.pdfTranslation.enabled,
      blocklistDomains: config.pdfTranslation.blocklistDomains,
      allowFileProtocol: config.pdfTranslation.allowFileProtocol,
      viewerOrigin: browser.runtime.getURL("").replace(/\/$/, ""),
    })
    if (decision.action === "redirect" && decision.viewerUrl)
      void browser.tabs.update(details.tabId, { url: decision.viewerUrl })
  })
}
```

**Step 1: 写失败测试（≥ 8 条）**

```ts
// __tests__/pdf-redirect.test.ts
import { describe, expect, it } from "vitest"
import { decideRedirect } from "../pdf-redirect"

const base = {
  activationMode: "always" as const,
  enabled: true,
  blocklistDomains: [],
  allowFileProtocol: true,
  viewerOrigin: "chrome-extension://abc",
}

describe("decideRedirect", () => {
  it("redirects https .pdf when enabled + always", () => {
    const d = decideRedirect({ ...base, targetUrl: "https://a.com/x.pdf" })
    expect(d.action).toBe("redirect")
    expect(d.viewerUrl).toBe("chrome-extension://abc/pdf-viewer.html?src=https%3A%2F%2Fa.com%2Fx.pdf")
  })

  it("skips when enabled=false", () => {
    expect(decideRedirect({ ...base, enabled: false, targetUrl: "https://a.com/x.pdf" }).action).toBe("skip")
  })

  it("skips when activationMode=manual", () => {
    expect(decideRedirect({ ...base, activationMode: "manual", targetUrl: "https://a.com/x.pdf" }).action).toBe("skip")
  })

  it("skips file:// when allowFileProtocol=false", () => {
    expect(decideRedirect({ ...base, allowFileProtocol: false, targetUrl: "file:///tmp/a.pdf" }).action).toBe("skip")
  })

  it("redirects file:// when allowFileProtocol=true", () => {
    expect(decideRedirect({ ...base, targetUrl: "file:///tmp/a.pdf" }).action).toBe("redirect")
  })

  it("skips domain in blocklist", () => {
    expect(decideRedirect({ ...base, blocklistDomains: ["evil.com"], targetUrl: "https://evil.com/x.pdf" }).action).toBe("skip")
  })

  it("skips non-.pdf url", () => {
    expect(decideRedirect({ ...base, targetUrl: "https://a.com/page" }).action).toBe("skip")
  })

  it("skips URL with .pdf in query but not in path", () => {
    expect(decideRedirect({ ...base, targetUrl: "https://a.com/p?x=y.pdf" }).action).toBe("skip")
  })

  it("redirects .pdf path with query string", () => {
    const d = decideRedirect({ ...base, targetUrl: "https://a.com/x.pdf?t=1" })
    expect(d.action).toBe("redirect")
  })

  it("mode=ask still redirects (confirm UX happens inside viewer)", () => {
    expect(decideRedirect({ ...base, activationMode: "ask", targetUrl: "https://a.com/x.pdf" }).action).toBe("redirect")
  })
})
```

**Step 2: 验证失败** → `pnpm test -- pdf-redirect` → FAIL

**Step 3: 实现 `decideRedirect` + `setUpPdfRedirect`**

**Step 4: 验证测试通过 + 冒烟**

- `pnpm --filter @getu/extension test -- pdf-redirect` → PASS
- dev 构建，访问任意 https PDF，自动跳转我们的 viewer

**Step 5: Commit**

```bash
git commit -m "feat(background): intercept .pdf navigation and redirect to viewer (M3 PR#A Task 3)"
```

---

## Task 4: Viewer 内嵌 E2 "首次询问" Toast + blocklist 写入

**Goal:** `activationMode=ask` 时，viewer 加载后在右下角弹 toast："用 GetU 翻译本域名 PDF？[翻译] [这次不用] [永不]"。"永不"把域名写入 `pdfTranslation.blocklistDomains`。

**Files:**

- Create: `apps/extension/src/entrypoints/pdf-viewer/components/first-use-toast.tsx`（React 组件，用 `@/components/ui` 现有 Toast 或 shadcn Dialog）
- Modify: `apps/extension/src/entrypoints/pdf-viewer/main.ts` — 挂载 React root 并只在 `activationMode === "ask"` 且域名不在 block/allow 列表时展示
- Create: `apps/extension/src/utils/atoms/pdf-translation.ts`（Jotai atoms 读/写 `pdfTranslation` 子配置，仿 `utils/atoms/config.ts` 模式）
- Create: `apps/extension/src/utils/pdf/domain.ts`（`extractDomain(url: string): string` —— 从 http(s)/file URL 取 hostname 或 `file://local`）
- Create: `apps/extension/src/utils/pdf/__tests__/domain.test.ts`

**三选项语义:**

- **翻译**：关闭 toast，本次阅读继续（PR #B 再触发翻译）；记住本标签页"已同意"的短期状态，不改配置
- **这次不用**：关闭 toast；与上同；仅当前 tab 生效
- **永不**：把 `extractDomain(src)` push 进 `pdfTranslation.blocklistDomains`，下次同域名 PDF 不再接管

**Step 1: 写失败测试（domain util + toast 逻辑）**

```ts
// utils/pdf/__tests__/domain.test.ts
describe("extractDomain", () => {
  it("returns hostname for https", () => expect(extractDomain("https://a.b.com/x.pdf")).toBe("a.b.com"))
  it("returns sentinel for file://", () => expect(extractDomain("file:///tmp/x.pdf")).toBe("file://local"))
  it("lowercases hostname", () => expect(extractDomain("https://A.COM/x.pdf")).toBe("a.com"))
})
```

组件测试（React Testing Library）验证三个按钮分别调对应的 handler、"永不"路径调用 `addDomainToBlocklist`。

**Step 2: 验证失败** → FAIL

**Step 3: 实现**

- `extractDomain` 用 `new URL()`，file:// 走短路
- Toast 复用 `@/components/frog-toast` 或 shadcn `<AlertDialog>`
- 组件只依赖注入的 handlers，方便测试

**Step 4: 验证通过 + 冒烟**

- 清 DEFAULT_CONFIG 重置 → 打开 PDF → 看到 toast
- 点"永不" → 刷新同 URL → Chrome 走回原生 PDFium

**Step 5: Commit**

```bash
git commit -m "feat(pdf-viewer): add first-use activation toast with blocklist persistence (M3 PR#A Task 4)"
```

---

## Task 5: Popup "翻译当前 PDF" 按钮（E3 手动兜底）

**Goal:** 选了"永不"或 `activationMode=manual` 的用户，仍然可以从 popup 手动跳 viewer。

**Files:**

- Create: `apps/extension/src/entrypoints/popup/components/translate-current-pdf-button.tsx`
- Modify: `apps/extension/src/entrypoints/popup/app.tsx`（在合适位置插入新按钮）
- Modify: `apps/extension/src/locales/*.yml` — 新增 key `popup.translateCurrentPdf`（8 语种，先用英文占位 TODO）

**按钮可见性条件:**

- 当前 tab URL 以 `.pdf` 结尾（path，非 query）
- 或当前 tab URL 为我们的 viewer（此时改为"重新翻译"按钮；PR #B 用）

**Click 行为:**

```ts
const viewerUrl = browser.runtime.getURL(`/pdf-viewer.html?src=${encodeURIComponent(currentUrl)}`)
await browser.tabs.update(currentTabId, { url: viewerUrl })
window.close()  // 关 popup
```

**Step 1: 写失败测试**

```ts
// translate-current-pdf-button.test.tsx
describe("TranslateCurrentPdfButton", () => {
  it("renders when current URL is pdf", () => { /* ... */ })
  it("hidden when current URL is not pdf", () => { /* ... */ })
  it("opens viewer URL when clicked", async () => { /* ... */ })
})
```

**Step 2-4:** 失败 → 实现 → 通过

**Step 5: Commit**

```bash
git commit -m "feat(popup): add manual translate-current-pdf button (M3 PR#A Task 5)"
```

---

## Task 6: Options 页 "PDF 翻译" Tab

**Goal:** 给用户一个管理 PDF 接管偏好的页面。

**Files:**

- Create: `apps/extension/src/entrypoints/options/pages/pdf-translation/index.tsx`（`PdfTranslationPage`，export named）
- Modify: `apps/extension/src/entrypoints/options/app.tsx` — `ROUTE_COMPONENTS` 加 lazy 映射
- Modify: `apps/extension/src/entrypoints/options/app-sidebar/nav-items.ts` — `ROUTE_DEFS` 追加 `{ path: "/pdf-translation", ... }`
- Modify: `apps/extension/src/entrypoints/options/command-palette/search-items.ts`（如存在对应项）
- Modify: `apps/extension/src/locales/*.yml` —`options.pdfTranslation.*` 若干 key

**页面内容（用 `PageLayout` + `ConfigCard`）:**

1. **全局开关** — `pdfTranslation.enabled`
2. **激活模式** — RadioGroup：始终接管 / 每次询问 / 仅手动
3. **域名黑名单** — list + remove（复用现有 blacklistPatterns UI 模式）
4. **file:// 权限** — 检测 `browser.extension.isAllowedFileSchemeAccess()`：
   - 未开 → 显示引导卡片 + 截图 + 复制 `chrome://extensions/?id=<id>` 到剪贴板按钮
   - 已开 → 显示勾选绿色标记

**Step 1-5:** 按 shadcn `ConfigCard` 现有模式走；页面可以没有业务逻辑测试，但要有 smoke render 测试保证 route 能加载。

```ts
// __tests__/pdf-translation-page.test.tsx — 仅渲染 smoke
describe("PdfTranslationPage", () => {
  it("renders all sections", () => { /* 检查 4 个 section heading 都存在 */ })
})
```

**Commit:** `feat(options): add PDF translation settings page (M3 PR#A Task 6)`

---

## Task 7: i18n 8 语种补齐 + Firefox 兼容性冒烟

**Goal:** 所有新增文案在 8 个语言文件中都有 key（非英文可用英文临时占位 + TODO 注释）；Firefox build 不炸。

**Files:**

- Modify: `apps/extension/src/locales/en.yml`、`ja.yml`、`ko.yml`、`ru.yml`、`tr.yml`、`vi.yml`、`zh-CN.yml`、`zh-TW.yml`
- 新增 key 清单（最终以实际代码为准）:
  - `popup.translateCurrentPdf`
  - `pdfViewer.firstUseToast.title`
  - `pdfViewer.firstUseToast.accept`
  - `pdfViewer.firstUseToast.skipOnce`
  - `pdfViewer.firstUseToast.neverOnThisDomain`
  - `options.pdfTranslation.title`
  - `options.pdfTranslation.enabled.label`
  - `options.pdfTranslation.activationMode.label`
  - `options.pdfTranslation.activationMode.always`
  - `options.pdfTranslation.activationMode.ask`
  - `options.pdfTranslation.activationMode.manual`
  - `options.pdfTranslation.blocklist.label`
  - `options.pdfTranslation.fileProtocol.label`
  - `options.pdfTranslation.fileProtocol.guide`

**Firefox 专项冒烟**

```bash
pnpm --filter @getu/extension build -- -b firefox
# 加载 .output/firefox-mv3 到 about:debugging
# 访问任意 https PDF
# 确认拦截 & viewer 可渲染；若 Firefox 的 MIME 处理不拦，降级到"仅 .pdf 后缀 + content-type 判断"的兜底逻辑
```

**已知 Firefox 差异:**

- Firefox MV3 默认对 PDF 会走 `pdfjs` 内置 viewer（不是 PDFium），可能在 `webNavigation.onBeforeNavigate` 之前就接管；若出现这种情况改成 `declarativeNetRequest` redirect 或监听 `history.onCommitted` 做事后跳转
- 记录任何 Firefox 特殊处理到 `pdf-viewer/AGENTS.md`

**Step 1:** 先本地 `pnpm --filter @getu/extension build -- -b firefox`
**Step 2:** 若失败 → 看 error → 最多 3 轮调整后停下来问；如需 declarativeNetRequest 则更新 plan（**超出本 Task 范围时** 升级为独立 Task 7.5）
**Step 3:** Chrome + Firefox 双端冒烟通过 → 继续
**Step 4:** Commit

```bash
git commit -m "feat(i18n+firefox): i18n keys + firefox compat for pdf viewer (M3 PR#A Task 7)"
```

---

## Task 8: Changeset + PR 开启

**Files:**

- Create: `.changeset/m3-pdf-viewer-foundation.md`

**Changeset body:**

```md
---
"@getu/extension": minor
---

feat: M3 PR#A — PDF viewer foundation

- New `pdf-viewer` entrypoint powered by `pdfjs-dist` (replaces browser's default PDF viewer)
- Background `.pdf` navigation interception with first-use opt-in toast
- Popup "Translate current PDF" manual fallback button
- Options "PDF Translation" settings page (global switch + activation mode + blocklist + file:// access guide)
- Chrome + Firefox MV3 compatible
- No translation yet — PR #B adds auto-translate + quota
```

**验证全量绿灯:**

```bash
SKIP_FREE_API=true pnpm test
pnpm type-check
pnpm lint
```

**Push + PR:**

```bash
git push -u origin feat/m3-pdf-translate
gh pr create --title "feat(pdf): M3 PR#A — viewer foundation + navigation interception" \
  --body "$(cat <<'EOF'
## Summary

PR #A of M3 milestone (PDF bilingual translation). Ships the viewer + navigation
interception foundation; no translation yet.

Design: docs/plans/2026-04-21-m3-pdf-translate-design.md
Plan:   docs/plans/2026-04-21-m3-pdf-translate-pr-a.md

## Test plan

- [ ] Chrome: open any .pdf URL → first-use toast → "Accept" loads our viewer
- [ ] Chrome: choose "Never" → reload → native PDFium resumes
- [ ] Chrome: popup button works on .pdf tab
- [ ] Firefox: same flow after `-b firefox` build
- [ ] file://: after enabling "Allow file URLs" in extension settings, local PDF opens in our viewer
- [ ] Options → PDF Translation page: all controls functional

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Request adversarial review:**

```
/codex:adversarial-review
```

**Commit:**

```bash
git add .changeset/m3-pdf-viewer-foundation.md
git commit -m "chore(changeset): M3 PR#A foundation"
```

---

## PR #A 验收标准

- [ ] Task 1–8 全部完成，每个独立 commit
- [ ] 新增测试 ≥ 20 条（domain util / migration / decideRedirect / first-use toast / popup button / page smoke）
- [ ] `SKIP_FREE_API=true pnpm test && pnpm type-check && pnpm lint` 全绿
- [ ] Chrome MV3 + Firefox MV3 双端冒烟通过
- [ ] `codex:adversarial-review` 无 P0 / P1 未决
- [ ] Changeset 入库

## 出 scope（PR #B 再做）

- 段落重组算法
- textLayer 译文叠加
- 配额统计 + UpgradeDialog
- Pro 导出 PDF
- 缓存表（`pdf-translations.ts`）
- 水印组件

## 风险与回退

| 风险                                     | 缓解                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| Firefox PDF 拦截不生效                   | Task 7 专项验证；必要时启用 declarativeNetRequest   |
| pdfjs-dist bundle 过大                   | 独立 entrypoint 懒加载，不污染 popup/options        |
| 本地 file:// 权限未勾时用户投诉         | Options 页显眼引导 + popup 按钮 toast 二次提示      |
| pdf.worker 在 extension 域加载失败      | Task 2 冒烟必须验证；`new URL(..., import.meta.url)` 让 Vite 生成对路径 |

---

## 下一步（PR #B / PR #C）

PR #A 合并后在同一 worktree 新分支 `feat/m3-pdf-translate-core` 重复 brainstorm → writing-plans 流程。PR #B 的草稿任务已列在设计文档"Delivery Strategy"章节，届时细化成独立 plan 文件 `2026-04-21-m3-pdf-translate-pr-b.md`。
