# M5 生词本 + Anki 闭环 — 设计文档

> **状态**: 已确认，待实施
> **日期**: 2026-04-23

## 核心决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Anki .apkg | 暂缓，PR3 只做 CSV + Markdown | 技术风险高（SQLite WASM），先验证核心闭环 |
| 间隔复习算法 | 简化 SM-2（3档：Again / Good / Easy） | 降低用户认知负担，M5 是验证阶段 |
| 复习 UI 入口 | popup 角标按钮 → options `/review` 路由 | 不改动 popup 现有布局，复习给足空间 |
| 保存行为 | 立即写 DB，翻译异步回填 | 即时反馈，复用 selection toolbar 翻译逻辑 |

---

## 数据模型

### Dexie `words` 表（version 10）

```ts
class Word extends Entity {
  id!: number          // auto-increment PK
  word!: string        // 原词（indexed）
  context!: string     // 划词时的原句
  sourceUrl!: string   // 来源页面 URL
  translation?: string // 异步回填
  interval!: number    // SM-2: 当前间隔天数（初始=1）
  repetitions!: number // 成功复习次数（初始=0）
  nextReviewAt!: Date  // indexed，用于"今日到期"查询
  createdAt!: Date     // indexed，用于 free-tier 100词计数
}
```

**索引**：`++id, word, nextReviewAt, createdAt`

### SM-2 简化调度

| 评级 | rep=0 | rep=1 | rep≥2 |
|------|-------|-------|-------|
| Again | interval=1, rep=0 | interval=1, rep=0 | interval=1, rep=0 |
| Good | interval=1, rep++ | interval=3, rep++ | interval=⌈interval×2.5⌉, rep++ |
| Easy | interval=4, rep++ | interval=⌈interval×3⌉, rep++ | interval=⌈interval×4⌉, rep++ |

`nextReviewAt = now + interval days`

---

## PR 切片

### PR1：Dexie words 表 + CRUD + "加入生词本"按钮（基建）

**文件变更**：
- `utils/db/dexie/tables/word.ts` — Word Entity
- `utils/db/dexie/app-db.ts` — version 10，加 words 表
- `utils/db/dexie/words.ts` — addWord / getWord / getDueWords / getWordCount / updateWordTranslation
- `entrypoints/selection.content/selection-toolbar/save-word-button/index.tsx` — 按钮 UI
- `entrypoints/selection.content/selection-toolbar/save-word-button/provider.tsx` — 异步翻译回填

**按钮行为**：
1. 点击 → 立即 `addWord({ word, context, sourceUrl, translation: undefined })`
2. word 已存在 → toast "已在生词本"
3. 保存成功 → toast "已加入生词本" + 按钮变绿
4. 后台异步翻译 → `db.words.update(id, { translation })`

### PR2：SM-2 调度算法 + "今日复习"页

**文件变更**：
- `utils/sm2.ts` — scheduleReview(word, grade) 纯函数 + 单元测试
- `entrypoints/options/pages/review/index.tsx` — ReviewPage 闪卡主界面
- `entrypoints/options/pages/review/flashcard.tsx` — 正面（词）/ 背面（译+原句）
- `entrypoints/options/pages/review/grade-buttons.tsx` — Again / Good / Easy 按钮
- `entrypoints/popup/components/review-entry-button.tsx` — popup 入口按钮（带待复习数量角标）
- options 路由加 `/review` 路由

### PR3：导出 CSV + Obsidian Markdown

**文件变更**：
- `utils/export/words-csv.ts` — 生成 CSV Blob（word, context, translation, mastery, nextReviewAt）
- `utils/export/words-markdown.ts` — 每词一个 ## 块，带 YAML frontmatter
- `entrypoints/options/pages/wordbook/export-menu.tsx` — 下拉菜单：CSV / Markdown
- `entrypoints/options/pages/wordbook/index.tsx` — 生词本管理页（列表 + 导出入口）

### PR4：Free 100词限制 + UpgradeDialog（商业化）

**文件变更**：
- `utils/db/dexie/words.ts` — 新增 `canAddWord(): Promise<boolean>`（count < 100）
- `entrypoints/selection.content/selection-toolbar/save-word-button/index.tsx` — 触发 UpgradeDialog（复用现有 billing 组件）
- entitlements 配置加 `wordbook` feature flag

---

## Pro 云同步

留给 M10 WebDAV milestone，不在本次范围内。
