# M3 · PDF 双语翻译 · 设计文档

> **Parent plan:** `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md` → M3
> **Status:** Design validated via `superpowers:brainstorming`（2026-04-21）
> **Next:** 运行 `superpowers:writing-plans` 产出可执行 TDD 任务拆解，PR 边界见 "Delivery Strategy"
> **For Claude:** 这是设计文档，不是实施计划。不要直接照抄写代码；实施前必须先用 `writing-plans` 产出任务清单。

---

## Goal

在 GetU 扩展里新增 **PDF 双语翻译** 能力，对标沉浸式翻译的 PDF 阅读体验，作为 M3 里程碑交付：

1. 在 Chrome / Firefox 上接管 `.pdf` 导航（在线 + 本地 `file://`），用自建 pdf.js viewer 渲染
2. 打开即自动全文翻译，在原段落下方插入译文块（上下对照）
3. 翻译结果按 PDF 指纹缓存 30 天，复看同一文件不扣额度
4. Free 用户每日 50 页（成功才扣）+ 阅读器右下角水印；超额后拦截新页翻译但已翻页可读
5. Pro 用户一键导出"带翻译注释层的双语 PDF"；无水印、无额度

---

## Non-Goals (out of scope)

| 项                                              | 原因                                         | 归属         |
| ----------------------------------------------- | -------------------------------------------- | ------------ |
| iframe 内嵌 PDF（Google Drive / arXiv preview） | 各家 viewer 差异大，容易退化                 | 社区贡献     |
| 加密 / 登录后 PDF / `declarativeNetRequest` 鉴权 | 复杂度超出 3 周                               | M3.5 或 M7+  |
| OCR 扫描版 PDF（无 textLayer）                  | 需要 Vision 模型                              | M8           |
| 后端 BabelDOC 风格重排版                        | 需后端 + 存储 + 计费；和 Pro 导出功能有重叠   | Enterprise   |
| 多栏 / 表格 / 公式密集段落的完美排版            | 启发式段落重组必然有降级；写明"已知限制"即可 | 已知限制     |
| 富文本编辑器（飞书 / Slack）→ 不相关            | —                                            | M2.5         |

---

## Key Decisions（brainstorming 结论）

| # | 主题             | 结论                                                                     |
| - | ---------------- | ------------------------------------------------------------------------ |
| 1 | 技术路线         | **A + B**：纯 viewer 覆盖层 + 客户端 `pdf-lib` 导出；不上后端             |
| 2 | 触达场景         | 在线 PDF URL + 本地 `file://` PDF；iframe / 加密场景出 scope             |
| 3 | 呈现方式         | 段落下方插入译文块（沉浸式风格，上下对照）                               |
| 4 | 触发 + 计费       | **T1 + Q2**：打开即全文翻译；页翻译成功才扣 1 页                          |
| 5 | 去重策略         | **D2**：按文件 SHA-256 指纹 + 页码缓存译文；30 天 LRU；UI 不标注命中状态 |
| 6 | Viewer 接管默认行为 | **E2 + E3**：首次弹询问（翻译 / 这次不用 / 永不）+ popup 手动兜底；file:// 加权限引导 |
| 7 | 交付切片         | 3 个 PR（viewer 基建 / 核心翻译 + 配额 / Pro 导出 + UI）                  |

---

## Architecture

### 三个主要模块

```
apps/extension/src/
├─ entrypoints/
│  ├─ pdf-viewer/                   [新增] 独立 HTML 页面，vendor pdfjs-dist viewer
│  │  ├─ index.html                    # 接管后的 viewer 页面
│  │  ├─ main.ts                       # 启动 pdf.js + 接入翻译层
│  │  ├─ paragraph/                 [核心] textLayer 段落重组
│  │  │  ├─ aggregate.ts               # span → 段落启发式（借鉴 BabelDOC，GPLv3 兼容）
│  │  │  └─ __tests__/
│  │  ├─ translation/               [核心] 调现有 translateSegments
│  │  │  ├─ scheduler.ts               # T1 全文批量 + 并发 4
│  │  │  ├─ overlay.tsx                # 段落下方插入译文 div
│  │  │  └─ __tests__/
│  │  ├─ quota/                     [新增] useInputQuota 的 PDF 版本
│  │  │  └─ use-pdf-quota.ts
│  │  ├─ export/                    [新增] PR C
│  │  │  ├─ pdf-lib-writer.ts          # 注释层写回原 PDF
│  │  │  └─ fonts/noto-cjk-subset.ts   # CJK 字体按需 fetch
│  │  └─ toolbar/                   [新增] GetU 专属按钮（语言 / 导出 / 清缓存）
│  └─ background/
│     └─ pdf-redirect.ts            [新增] E2 询问 + redirect 到 pdf-viewer/
├─ utils/db/dexie/tables/
│  ├─ pdf-translations.ts           [新增] { fileHash, pageIndex, srcHash, translation, createdAt }
│  └─ pdf-translation-usage.ts      [新增] { dateKey, count }（仿 M2）
├─ utils/pdf/
│  ├─ fingerprint.ts                [新增] 在线 = URL+content-length+首4KB SHA；本地 = 全文 SHA
│  └─ __tests__/
└─ entrypoints/options/pages/translation/pdf/
   └─ index.tsx                     [新增] 开关 / 黑名单 / 缓存管理 / 今日用量

packages/definitions/src/pdf/       [新增] FREE_PDF_PAGES_PER_DAY=50 等常量
```

### 关键接口

```ts
// pdf-viewer/translation/scheduler.ts
export interface PdfTranslateScheduler {
  start(file: PdfFileSource): Promise<void>   // T1：打开即全量启动
  onPageSuccess: (cb: (pageIndex: number) => void) => void  // 触发 Q2 扣额度
}

// utils/db/dexie/tables/pdf-translations.ts
export async function getCachedTranslation(
  fileHash: string,
  pageIndex: number,
): Promise<PdfPageTranslation | null>
export async function putTranslation(rec: PdfPageTranslation): Promise<void>
export async function evictOldEntries(ttlMs: number, maxBytes: number): Promise<void>

// quota/use-pdf-quota.ts（仿 M2 useInputTranslationQuota）
export function usePdfTranslationQuota(): {
  used: number
  limit: number | 'unlimited'
  canTranslateNewPage: boolean
  recordPageSuccess: () => Promise<void>   // Q2
}
```

### 数据流（单份 PDF 打开）

```
.pdf 导航
   │
   ▼
background/pdf-redirect.ts
   ├─ 检查 domain blocklist / 用户偏好
   ├─ 首次 → 注入询问 toast（E2）
   └─ 确认 → redirect pdf-viewer/index.html?src=<url>
              │
              ▼
        pdf-viewer/main.ts
              ├─ pdfjs 渲染原 PDF
              ├─ fingerprint(file) → fileHash
              ├─ 对每页：getCachedTranslation(fileHash, i)
              │     命中 → 直接 overlay，不扣额度
              │     未命中 → scheduler 入队
              ├─ scheduler 并发 4，每页成功 → putTranslation + recordPageSuccess()
              │     recordPageSuccess 内部：checkQuota → 命中上限 → pause scheduler + UpgradeDialog
              └─ 已翻页继续可读，未翻页显示"本日额度已用尽"行内提示
```

### Entitlements

- 复用 M0 `billing.getEntitlements`；无需新增 oRPC 路由
- 新增 feature keys（放 `packages/contract/src/billing/entitlements.ts`）：
  - `pdf_translate_unlimited`：去掉每日 50 页限制 + 去水印
  - `pdf_translate_export`：允许导出双语 PDF（分开是为了未来切"配额归 Pro、导出归 Enterprise"）

---

## Delivery Strategy

**3 个 PR，1 条 worktree `.claude/worktrees/m3-pdf-translate`，每 PR 合并前 `codex:adversarial-review` 复核：**

### PR #A · PDF viewer 接管 + 基础渲染（第 1 周）

**目标**：装完插件能用我们的 viewer 打开 `.pdf`（在线 + 本地），暂无翻译。

- `entrypoints/pdf-viewer/` viewer HTML + main.ts（vendor pdfjs-dist）
- `entrypoints/background/pdf-redirect.ts` E2 询问 toast + 偏好存储
- `packages/definitions/src/pdf/` 常量
- `apps/extension/wxt.config.ts` 新增 host permissions + `web_accessible_resources`
- Firefox manifest 差异专项验证
- Popup 新增"翻译当前 PDF"按钮（E3 兜底）
- Options 页 PDF Tab 雏形（全局开关 + 域名黑名单 + file:// 权限引导）

**验收**：Chrome + Firefox 打开在线 + 本地 PDF 均能走到自建 viewer；"永不"和 blocklist 生效；file:// 未开权限时 toast 引导打开 `chrome://extensions`。

### PR #B · 段落重组 + 双语叠加 + 配额（第 2 周，核心）

**目标**：打开 PDF 即自动双语；50 页/天；命中缓存不扣。

- `pdf-viewer/paragraph/` textLayer item → 段落聚合（启发式借鉴 BabelDOC）
- `pdf-viewer/translation/` scheduler + overlay，对接现有 `translateSegments` pipeline
- `utils/db/dexie/tables/pdf-translations.ts` + `pdf-translation-usage.ts`
- `utils/pdf/fingerprint.ts`
- `quota/use-pdf-quota.ts`
- 接入 `useProGuard('pdf_translate_unlimited')`：超额弹 UpgradeDialog；已翻页继续可读

**验收**：打开 PDF 自动双语叠加；配额耗尽拦新页但已翻页 OK；再开同文件 0 页扣费；`pnpm test && type-check && lint` 全绿。

### PR #C · Pro 导出双语 PDF + 水印 + Options UI（第 3 周）

**目标**：Pro 一键导出；Free 水印 + 升级引导；Options 完整。

- `pdf-viewer/export/` `pdf-lib` 注释层写回原 PDF
- CJK 字体：Noto Sans CJK 子集化按需 fetch（避免 40MB 主包膨胀）
- Viewer 右下角水印组件（Free 可见）+ 点击 UpgradeDialog
- `options/pages/translation/pdf/` 完整：全局开关、黑名单、缓存管理、今日用量、目标语言、provider 选择
- i18n 8 语种
- Changeset：`feat: add PDF bilingual translation (M3)`

**验收**：Pro 菜单导出双语 PDF 成功打开；中英混排 + 日文测试样本无乱码；Free 看到水印 + 升级入口；options 所有 tab 无 i18n 缺失。

---

## Risks & Mitigations

| 风险                                     | 影响                          | 缓解                                                                 |
| ---------------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| **段落重组算法不稳定**                   | 双语排版错乱，用户投诉         | 优先借鉴 BabelDOC 启发式；ship 时带 "排版异常反馈"入口；已知限制文档 |
| **CJK 字体导出包体膨胀**                 | Chrome Web Store 包体超限      | 字体独立 chunk + 按需 fetch；首次导出可能等 3–5s 下载               |
| **Firefox 的 PDF MIME 拦截与 Chrome 不同** | Firefox 上无法接管 `.pdf`     | PR #A 第 1 周专项验证，必要时独立 manifest 分支                     |
| **pdf.js 主包 ~1.5MB**                   | 扩展包体增长                   | viewer 作为独立 entrypoint 懒加载，不进 popup/options bundle        |
| **打开大 PDF（200+ 页）时并发翻译打满**   | 浏览器卡顿 / API rate limit   | 并发固定 4 + 按滚动位置优先级排序；已翻页提前缓存                   |
| **打印 / 表单填写 / 签名等 PDFium 能力丢失** | 用户抱怨"功能倒退"            | viewer toolbar 保留"在原生阅读器打开"按钮；文档写清                 |
| **加密 PDF / 权限保护**                  | viewer 加载失败，白屏         | 捕获 `PasswordException` → 弹密码输入框或降级到原生 viewer         |

---

## Open Questions (留给 writing-plans 阶段细化)

1. pdf.js viewer 是 **fork 整个 `web/viewer.html` 到仓库** 还是 **用 `pdfjs-dist` 的 viewer bundle + 自定义 toolbar slot**？前者灵活但维护成本高；后者轻但定制受限。倾向**后者先上**。
2. 段落重组的启发式具体抄 BabelDOC 的哪几个模块？需要读它的 Python 源码再映射到 TS。
3. 水印的 DOM 实现：随 viewer scroll 固定 vs 每页右下角？沉浸式是每页右下角，更"刻意"一些；先做 viewer 固定（简单）留迭代空间。
4. 缓存清理策略：30 天 LRU 的触发时机（启动时 / 用量达阈值 / 用户手动）？可能三者都要。

---

## Acceptance (M3 total)

- [ ] 装完插件，Chrome + Firefox 打开在线 + 本地 PDF 均能走到自建 viewer
- [ ] E2 询问 toast 行为：翻译 / 这次不用 / 永不；偏好持久化
- [ ] 打开 PDF 自动全文双语翻译，段落下方插入译文块
- [ ] Free 账号 51 页翻译后新页被拦 + UpgradeDialog；已翻页继续可读
- [ ] 同文件第二次打开 0 页扣费
- [ ] Pro 账号导出双语 PDF：中英混排样本、日文样本、100 页 PDF 均成功
- [ ] Free 阅读界面有水印；Pro 无水印
- [ ] Options 页 PDF Tab 完整（开关 / 黑名单 / 缓存管理 / 用量）
- [ ] i18n 8 语种补齐
- [ ] `pnpm test && type-check && lint` 全绿；新增测试 ≥ 25 条
- [ ] 3 个 PR 均通过 `codex:adversarial-review`
- [ ] Changeset 入库

---

## Preconditions

- M0 entitlements + `useProGuard` 已完成
- M0 `UpgradeDialog` 挂点复用方式已在 M2 验证
- Dexie schema migration 机制已熟悉（`migration-scripts` skill）
- `translateSegments` / `translateTextForInput` 等现有段落翻译 pipeline 稳定

## Follow-ups (M3.5+)

- iframe 内嵌 PDF 适配
- 扫描版 PDF OCR 集成（M8 耦合）
- PDF 翻译结果云同步（和 M10 WebDAV / Supabase 耦合）
- 术语表注入 PDF 翻译 prompt（和 M6 耦合）
