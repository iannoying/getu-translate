# M5 PR1 — Dexie words 表 + CRUD + "加入生词本"按钮 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-23-m5-wordbook-anki-design.md`
> **Predecessors:** main (clean)

**Goal:** 建立 M5 生词本基建：Dexie `words` 表（version 10）+ 完整 CRUD + 划词工具栏"加入生词本"按钮（立即保存，翻译异步回填）。

**Architecture:** 复用现有 Dexie Entity 模式（参考 `pdf-translation-usage.ts`）。按钮复用 `SpeakButton` 的 `<button>` 结构 + `SelectionToolbarTooltip`。翻译回填在 provider 里复用 selection 已有的翻译逻辑（取当前译文 atom）。

**Tech Stack:** Dexie 4 · React 19 · Jotai · sonner toast · WXT · vitest

---

## Preconditions

- Worktree: `.claude/worktrees/m5-pr1`，branch `feat/m5-pr1-words-db`
- Based on `main`
- Baseline: 1475 passing tests（5 pre-existing failures，不计入）
- 阅读参考文件：
  - `apps/extension/src/utils/db/dexie/tables/pdf-translation-usage.ts` — Entity 模式
  - `apps/extension/src/utils/db/dexie/app-db.ts` — 版本迭代方式
  - `apps/extension/src/utils/db/dexie/pdf-translation-usage.ts` — CRUD + 事务模式
  - `apps/extension/src/utils/db/dexie/__tests__/pdf-translation-usage.test.ts` — mock 测试模式
  - `apps/extension/src/entrypoints/selection.content/selection-toolbar/speak-button.tsx` — 按钮结构
  - `apps/extension/src/entrypoints/selection.content/selection-toolbar/atoms.ts` — selection atoms

## Delivery

4 个 task，每个 task 一次 commit。

---

## Task 1: Word Entity + Dexie version 10

**Files:**
- Create: `apps/extension/src/utils/db/dexie/tables/word.ts`
- Modify: `apps/extension/src/utils/db/dexie/app-db.ts`

**Step 1: 创建 Word Entity**

```ts
// apps/extension/src/utils/db/dexie/tables/word.ts
import { Entity } from "dexie"

export default class Word extends Entity {
  id!: number
  word!: string
  context!: string
  sourceUrl!: string
  translation?: string
  interval!: number
  repetitions!: number
  nextReviewAt!: Date
  createdAt!: Date
}
```

**Step 2: 在 app-db.ts 中 import Word，在类型声明里加 words 表，并新增 version(10)**

在 `AppDB` class 的属性列表末尾加：
```ts
words!: EntityTable<Word, "id">
```

在 `version(9).stores(...)` 之后加 `version(10).stores(...)` —— 完整复制 v9 的 stores 对象，然后追加 `words` 表：
```ts
this.version(10).stores({
  translationCache: `key, translation, createdAt`,
  batchRequestRecord: `key, createdAt, originalRequestCount, provider, model`,
  articleSummaryCache: `key, createdAt`,
  aiSegmentationCache: `key, createdAt`,
  entitlementsCache: `userId, updatedAt`,
  inputTranslationUsage: `dateKey, updatedAt`,
  pdfTranslations: `id, fileHash, createdAt, lastAccessedAt`,
  pdfTranslationUsage: `dateKey, updatedAt`,
  words: `++id, word, nextReviewAt, createdAt`,
})
```

在 `mapToClass` 块末尾加：
```ts
this.words.mapToClass(Word)
```

**Step 3: 运行类型检查**
```bash
cd apps/extension && pnpm type-check
```
Expected: 无新增错误

**Step 4: Commit**
```bash
git add apps/extension/src/utils/db/dexie/tables/word.ts \
        apps/extension/src/utils/db/dexie/app-db.ts
git commit -m "feat(db): add words table — Dexie version 10 (M5 PR1 Task 1)"
```

---

## Task 2: words CRUD 函数 + 单元测试

**Files:**
- Create: `apps/extension/src/utils/db/dexie/words.ts`
- Create: `apps/extension/src/utils/db/dexie/__tests__/words.test.ts`

**Step 1: 写失败测试**

```ts
// apps/extension/src/utils/db/dexie/__tests__/words.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  addWord,
  canAddWord,
  getDueWords,
  getWordCount,
  updateWordTranslation,
} from "../words"

// ── mock shape ────────────────────────────────────────────────────
interface WordRow {
  id?: number
  word: string
  context: string
  sourceUrl: string
  translation?: string
  interval: number
  repetitions: number
  nextReviewAt: Date
  createdAt: Date
}

let rows: WordRow[] = []
let nextId = 1

const addMock = vi.fn(async (row: WordRow) => {
  const id = nextId++
  rows.push({ ...row, id })
  return id
})
const getMock = vi.fn(async (id: number) => rows.find(r => r.id === id))
const updateMock = vi.fn(async (id: number, changes: Partial<WordRow>) => {
  const idx = rows.findIndex(r => r.id === id)
  if (idx !== -1) rows[idx] = { ...rows[idx], ...changes }
  return 1
})
const whereMock = vi.fn()
const countMock = vi.fn(async () => rows.length)

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    words: {
      add: (...args: unknown[]) => addMock(...(args as [WordRow])),
      get: (...args: unknown[]) => getMock(...(args as [number])),
      update: (...args: unknown[]) => updateMock(...(args as [number, Partial<WordRow>])),
      where: (...args: unknown[]) => whereMock(...(args as unknown[])),
      count: (...args: unknown[]) => countMock(...(args as [])),
    },
  },
}))

beforeEach(() => {
  rows = []
  nextId = 1
  addMock.mockClear()
  getMock.mockClear()
  updateMock.mockClear()
  whereMock.mockClear()
  countMock.mockClear()
})

// ── addWord ───────────────────────────────────────────────────────
describe("addWord", () => {
  it("inserts a row with interval=1, repetitions=0, no translation", async () => {
    const id = await addWord({ word: "ephemeral", context: "An ephemeral moment.", sourceUrl: "https://example.com" })
    expect(addMock).toHaveBeenCalledOnce()
    const call = addMock.mock.calls[0][0] as WordRow
    expect(call.word).toBe("ephemeral")
    expect(call.interval).toBe(1)
    expect(call.repetitions).toBe(0)
    expect(call.translation).toBeUndefined()
    expect(typeof id).toBe("number")
  })

  it("sets nextReviewAt to tomorrow", async () => {
    const before = new Date()
    await addWord({ word: "test", context: "ctx", sourceUrl: "url" })
    const call = addMock.mock.calls[0][0] as WordRow
    const diffMs = call.nextReviewAt.getTime() - before.getTime()
    // ~24h window
    expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(diffMs).toBeLessThan(25 * 60 * 60 * 1000)
  })
})

// ── updateWordTranslation ─────────────────────────────────────────
describe("updateWordTranslation", () => {
  it("calls db.words.update with translation field", async () => {
    await updateWordTranslation(42, "fleeting")
    expect(updateMock).toHaveBeenCalledWith(42, { translation: "fleeting" })
  })
})

// ── getWordCount ──────────────────────────────────────────────────
describe("getWordCount", () => {
  it("returns the total count from db", async () => {
    countMock.mockResolvedValueOnce(37)
    const count = await getWordCount()
    expect(count).toBe(37)
  })
})

// ── canAddWord ────────────────────────────────────────────────────
describe("canAddWord", () => {
  it("returns true when count < FREE_WORD_LIMIT", async () => {
    countMock.mockResolvedValueOnce(99)
    expect(await canAddWord()).toBe(true)
  })

  it("returns false when count >= FREE_WORD_LIMIT", async () => {
    countMock.mockResolvedValueOnce(100)
    expect(await canAddWord()).toBe(false)
  })
})

// ── getDueWords ───────────────────────────────────────────────────
describe("getDueWords", () => {
  it("calls where('nextReviewAt').belowOrEqual with current date", async () => {
    const toArrayMock = vi.fn(async () => [])
    const belowOrEqualMock = vi.fn(() => ({ toArray: toArrayMock }))
    whereMock.mockReturnValue({ belowOrEqual: belowOrEqualMock })

    const now = new Date("2026-05-01T10:00:00Z")
    await getDueWords(now)

    expect(whereMock).toHaveBeenCalledWith("nextReviewAt")
    expect(belowOrEqualMock).toHaveBeenCalledWith(now)
  })
})
```

**Step 2: 运行测试，确认失败**
```bash
cd apps/extension && pnpm test --run src/utils/db/dexie/__tests__/words.test.ts
```
Expected: FAIL — "addWord is not a function"

**Step 3: 实现 words.ts**

```ts
// apps/extension/src/utils/db/dexie/words.ts
import { db } from "./db"

export const FREE_WORD_LIMIT = 100

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export async function addWord(params: {
  word: string
  context: string
  sourceUrl: string
}): Promise<number> {
  const now = new Date()
  return db.words.add({
    word: params.word,
    context: params.context,
    sourceUrl: params.sourceUrl,
    interval: 1,
    repetitions: 0,
    nextReviewAt: addDays(now, 1),
    createdAt: now,
  } as never)
}

export async function updateWordTranslation(id: number, translation: string): Promise<void> {
  await db.words.update(id, { translation })
}

export async function getWordCount(): Promise<number> {
  return db.words.count()
}

export async function canAddWord(): Promise<boolean> {
  const count = await getWordCount()
  return count < FREE_WORD_LIMIT
}

export async function getDueWords(now: Date = new Date()) {
  return db.words.where("nextReviewAt").belowOrEqual(now).toArray()
}
```

**Step 4: 运行测试，确认通过**
```bash
cd apps/extension && pnpm test --run src/utils/db/dexie/__tests__/words.test.ts
```
Expected: 全部 PASS

**Step 5: Commit**
```bash
git add apps/extension/src/utils/db/dexie/words.ts \
        apps/extension/src/utils/db/dexie/__tests__/words.test.ts
git commit -m "feat(db): words CRUD — addWord/updateWordTranslation/getDueWords/canAddWord (M5 PR1 Task 2)"
```

---

## Task 3: SaveWordButton 组件

**Files:**
- Create: `apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/index.tsx`
- Create: `apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/provider.tsx`

**Step 1: 先阅读以下文件建立上下文**
- `apps/extension/src/entrypoints/selection.content/selection-toolbar/speak-button.tsx`
- `apps/extension/src/entrypoints/selection.content/selection-toolbar/atoms.ts`
- `apps/extension/src/entrypoints/selection.content/selection-toolbar/translate-button/provider.tsx`（了解 selectionContext atom）

**Step 2: 创建 provider.tsx（封装保存 + 翻译回填逻辑）**

```tsx
// apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/provider.tsx
import { useAtomValue } from "jotai"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "@/hooks/use-translation"
import { addWord, updateWordTranslation } from "@/utils/db/dexie/words"
import { selectionContentAtom, selectionContextAtom } from "../atoms"

export function useSaveWord() {
  const selectionContent = useAtomValue(selectionContentAtom)
  const selectionContext = useAtomValue(selectionContextAtom)
  const [saved, setSaved] = useState(false)
  const { translate } = useTranslation()

  const save = useCallback(async () => {
    if (!selectionContent) return

    // 1. 立即保存（无翻译）
    const id = await addWord({
      word: selectionContent.trim(),
      context: selectionContext ?? "",
      sourceUrl: window.location.href,
    })

    setSaved(true)
    toast.success("已加入生词本")

    // 2. 异步翻译回填
    try {
      const result = await translate(selectionContent)
      if (result) {
        await updateWordTranslation(id, result)
      }
    }
    catch {
      // 翻译失败不影响保存结果
    }
  }, [selectionContent, selectionContext, translate])

  return { save, saved, hasSelection: Boolean(selectionContent?.trim()) }
}
```

> **注意**：如果 `useTranslation` / `translate` hook 不存在或接口不同，先查阅 `translate-button/provider.tsx` 确认实际调用方式，改写为相同模式（直接调用翻译 API 函数亦可）。

**Step 3: 创建 index.tsx（按钮 UI）**

```tsx
// apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/index.tsx
import { i18n } from "#imports"
import { IconBookmark, IconBookmarkFilled } from "@tabler/icons-react"
import { SelectionToolbarTooltip } from "../../components/selection-tooltip"
import { useSaveWord } from "./provider"

export function SaveWordButton() {
  const { save, saved, hasSelection } = useSaveWord()
  const label = saved ? i18n.t("wordbook.saved") : i18n.t("wordbook.save")

  return (
    <SelectionToolbarTooltip
      content={label}
      render={(
        <button
          type="button"
          className="px-2 h-7 flex items-center justify-center hover:bg-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={save}
          disabled={!hasSelection}
          aria-label={label}
        />
      )}
    >
      {saved
        ? <IconBookmarkFilled className="size-4.5 text-primary" strokeWidth={1.6} />
        : <IconBookmark className="size-4.5" strokeWidth={1.6} />}
    </SelectionToolbarTooltip>
  )
}
```

**Step 4: 添加 i18n 字符串**

在所有语言文件（至少 `en.json`、`zh-CN.json`）的 JSON 中加：
```json
"wordbook": {
  "save": "Add to Wordbook",
  "saved": "Saved to Wordbook"
}
```
语言文件位于 `apps/extension/src/locales/`

**Step 5: 在 SelectionToolbar 中注册按钮**

修改 `apps/extension/src/entrypoints/selection.content/selection-toolbar/index.tsx`：

在 `features` 相关渲染区块中（TranslateButton / SpeakButton 同级），加：
```tsx
import { SaveWordButton } from "./save-word-button"
// ...
{features.wordbook?.enabled !== false && <SaveWordButton />}
```

**Step 6: 类型检查**
```bash
cd apps/extension && pnpm type-check
```
Expected: 无新增错误（如有 atom 路径问题按实际调整 import）

**Step 7: Commit**
```bash
git add apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/ \
        apps/extension/src/entrypoints/selection.content/selection-toolbar/index.tsx \
        apps/extension/src/locales/
git commit -m "feat(selection): add SaveWordButton — immediate save + async translation backfill (M5 PR1 Task 3)"
```

---

## Task 4: 全量测试 + lint

**Step 1: 运行全量测试**
```bash
cd apps/extension && pnpm test --run
```
Expected: ≥ 1475 passing（新增 Task 2 的测试），5 pre-existing failures 不变

**Step 2: Lint**
```bash
cd apps/extension && pnpm lint
```
Expected: 无新增 error

**Step 3: 最终 commit（如 Task 3/4 有零散修改）**
```bash
git commit -m "chore(m5-pr1): lint fixes + test baseline (M5 PR1 Task 4)"
```

**Step 4: 开 PR**

PR title: `feat(wordbook): Dexie words table + CRUD + SaveWordButton (M5 PR1)`
Base: `main`
