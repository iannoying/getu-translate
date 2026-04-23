# M5 PR2 — SM-2 调度算法 + "今日复习"页 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-23-m5-wordbook-anki-design.md`
> **Predecessors:** PR1 (`feat/m5-pr1-words-db` merged into main)

**Goal:** 实现简化 SM-2 调度逻辑（3 档：Again / Good / Easy）；在 options 里加 `/wordbook` 路由（生词本列表）和 `/review` 路由（闪卡复习页）；popup 顶部加"今日复习（N）"入口按钮。

**Architecture:** SM-2 逻辑为纯函数（zero deps，易测试）。ReviewPage 通过 `getDueWords()` 拉取到期词，每次评级后调用 `scheduleReview()` 更新 DB，全局 loading/empty/done 三态。WordbookPage 只做列表展示 + 删除，复用现有 shadcn Table 组件。

**Tech Stack:** React 19 · Jotai · Dexie live query · shadcn/ui · WXT browser API · vitest

---

## Preconditions

- Worktree: `.claude/worktrees/m5-pr2`，branch `feat/m5-pr2-review`
- Based on `feat/m5-pr1-words-db`（或 main 合并后 rebase）
- Baseline: PR1 的测试全部 passing
- 阅读参考文件：
  - `apps/extension/src/utils/db/dexie/words.ts` — getDueWords / getWordCount（PR1 产出）
  - `apps/extension/src/entrypoints/options/app.tsx` — 路由注册方式
  - `apps/extension/src/entrypoints/options/app-sidebar/nav-items.ts` — 路由常量
  - `apps/extension/src/entrypoints/options/app-sidebar/tools-nav.tsx` — sidebar 菜单项方式
  - `apps/extension/src/entrypoints/popup/components/translation-hub-button.tsx` — popup 按钮模式

## Delivery

4 个 task，每个 task 一次 commit。

---

## Task 1: SM-2 纯函数 + 单元测试

**Files:**
- Create: `apps/extension/src/utils/sm2.ts`
- Create: `apps/extension/src/utils/__tests__/sm2.test.ts`

**Step 1: 写失败测试**

```ts
// apps/extension/src/utils/__tests__/sm2.test.ts
import { describe, expect, it } from "vitest"
import { scheduleReview } from "../sm2"
import type { ReviewGrade, SM2Word } from "../sm2"

function makeWord(overrides: Partial<SM2Word> = {}): SM2Word {
  return {
    interval: 1,
    repetitions: 0,
    nextReviewAt: new Date(),
    ...overrides,
  }
}

describe("scheduleReview — Again", () => {
  it("resets interval to 1 and repetitions to 0 regardless of prior state", () => {
    const w = makeWord({ interval: 10, repetitions: 5 })
    const result = scheduleReview(w, "again", new Date())
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
  })

  it("sets nextReviewAt to ~1 day later", () => {
    const now = new Date("2026-05-01T10:00:00Z")
    const result = scheduleReview(makeWord(), "again", now)
    const diffDays = (result.nextReviewAt.getTime() - now.getTime()) / 86400000
    expect(diffDays).toBeCloseTo(1, 0)
  })
})

describe("scheduleReview — Good", () => {
  it("rep=0: interval becomes 1, rep becomes 1", () => {
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 0 }), "good", new Date())
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it("rep=1: interval becomes 3, rep becomes 2", () => {
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 1 }), "good", new Date())
    expect(result.interval).toBe(3)
    expect(result.repetitions).toBe(2)
  })

  it("rep>=2: interval multiplied by 2.5 (ceil)", () => {
    const result = scheduleReview(makeWord({ interval: 4, repetitions: 2 }), "good", new Date())
    expect(result.interval).toBe(Math.ceil(4 * 2.5)) // 10
    expect(result.repetitions).toBe(3)
  })
})

describe("scheduleReview — Easy", () => {
  it("rep=0: interval becomes 4, rep becomes 1", () => {
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 0 }), "easy", new Date())
    expect(result.interval).toBe(4)
    expect(result.repetitions).toBe(1)
  })

  it("rep=1: interval multiplied by 3 (ceil)", () => {
    const result = scheduleReview(makeWord({ interval: 4, repetitions: 1 }), "easy", new Date())
    expect(result.interval).toBe(Math.ceil(4 * 3)) // 12
    expect(result.repetitions).toBe(2)
  })

  it("rep>=2: interval multiplied by 4 (ceil)", () => {
    const result = scheduleReview(makeWord({ interval: 4, repetitions: 2 }), "easy", new Date())
    expect(result.interval).toBe(Math.ceil(4 * 4)) // 16
    expect(result.repetitions).toBe(3)
  })
})

describe("nextReviewAt calculation", () => {
  it("is based on provided now + interval days", () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 1 }), "good", now)
    // Good, rep=1 → interval=3
    const expected = new Date("2026-05-04T00:00:00Z")
    expect(result.nextReviewAt.getTime()).toBe(expected.getTime())
  })
})
```

**Step 2: 运行测试，确认失败**
```bash
cd apps/extension && pnpm test --run src/utils/__tests__/sm2.test.ts
```
Expected: FAIL

**Step 3: 实现 sm2.ts**

```ts
// apps/extension/src/utils/sm2.ts
export type ReviewGrade = "again" | "good" | "easy"

export interface SM2Word {
  interval: number
  repetitions: number
  nextReviewAt: Date
}

export interface SM2Result {
  interval: number
  repetitions: number
  nextReviewAt: Date
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function scheduleReview(
  word: SM2Word,
  grade: ReviewGrade,
  now: Date = new Date(),
): SM2Result {
  if (grade === "again") {
    return {
      interval: 1,
      repetitions: 0,
      nextReviewAt: addDays(now, 1),
    }
  }

  const { interval, repetitions } = word

  if (grade === "good") {
    let nextInterval: number
    if (repetitions === 0) nextInterval = 1
    else if (repetitions === 1) nextInterval = 3
    else nextInterval = Math.ceil(interval * 2.5)
    return {
      interval: nextInterval,
      repetitions: repetitions + 1,
      nextReviewAt: addDays(now, nextInterval),
    }
  }

  // "easy"
  let nextInterval: number
  if (repetitions === 0) nextInterval = 4
  else if (repetitions === 1) nextInterval = Math.ceil(interval * 3)
  else nextInterval = Math.ceil(interval * 4)
  return {
    interval: nextInterval,
    repetitions: repetitions + 1,
    nextReviewAt: addDays(now, nextInterval),
  }
}
```

**Step 4: 运行测试，确认通过**
```bash
cd apps/extension && pnpm test --run src/utils/__tests__/sm2.test.ts
```
Expected: 全部 PASS

**Step 5: 在 words.ts 中加 reviewWord CRUD**

```ts
// 在 apps/extension/src/utils/db/dexie/words.ts 追加：
import { scheduleReview } from "@/utils/sm2"
import type { ReviewGrade } from "@/utils/sm2"

export async function reviewWord(id: number, grade: ReviewGrade): Promise<void> {
  const word = await db.words.get(id)
  if (!word) return
  const result = scheduleReview(word, grade)
  await db.words.update(id, {
    interval: result.interval,
    repetitions: result.repetitions,
    nextReviewAt: result.nextReviewAt,
  })
}
```

**Step 6: Commit**
```bash
git add apps/extension/src/utils/sm2.ts \
        apps/extension/src/utils/__tests__/sm2.test.ts \
        apps/extension/src/utils/db/dexie/words.ts
git commit -m "feat(sm2): simplified 3-grade SM-2 scheduler + reviewWord CRUD (M5 PR2 Task 1)"
```

---

## Task 2: Options 路由 + Wordbook/Review 页面

**Files:**
- Modify: `apps/extension/src/entrypoints/options/app-sidebar/nav-items.ts`
- Modify: `apps/extension/src/entrypoints/options/app.tsx`
- Modify: `apps/extension/src/entrypoints/options/app-sidebar/tools-nav.tsx`
- Create: `apps/extension/src/entrypoints/options/pages/wordbook/index.tsx`
- Create: `apps/extension/src/entrypoints/options/pages/review/index.tsx`
- Create: `apps/extension/src/entrypoints/options/pages/review/flashcard.tsx`
- Create: `apps/extension/src/entrypoints/options/pages/review/grade-buttons.tsx`

**Step 1: nav-items.ts — 追加两个路由**

在 `ROUTE_DEFS` 数组末尾（`{ path: "/config" }` 之后）加：
```ts
{ path: "/wordbook" },
{ path: "/review" },
```

**Step 2: app.tsx — 注册懒加载组件**

在 import 块末尾加：
```ts
const WordbookPage = lazy(() => import("./pages/wordbook").then(m => ({ default: m.WordbookPage })))
const ReviewPage = lazy(() => import("./pages/review").then(m => ({ default: m.ReviewPage })))
```

在 `ROUTE_COMPONENTS` 对象加：
```ts
"/wordbook": WordbookPage,
"/review": ReviewPage,
```

**Step 3: tools-nav.tsx — 加生词本菜单项**

在 Translation Hub 的 `<SidebarMenuItem>` 之后加：
```tsx
import { Link } from "react-router"

<SidebarMenuItem>
  <SidebarMenuButton render={<Link to="/wordbook" />}>
    <Icon icon="tabler:bookmark" />
    <span>{i18n.t("options.tools.wordbook")}</span>
  </SidebarMenuButton>
</SidebarMenuItem>
```

在 `apps/extension/src/locales/en.json` 加 `"options.tools.wordbook": "Wordbook"`，`zh-CN.json` 加 `"options.tools.wordbook": "生词本"`

**Step 4: WordbookPage（列表）**

```tsx
// apps/extension/src/entrypoints/options/pages/wordbook/index.tsx
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/utils/db/dexie/db"

export function WordbookPage() {
  const words = useLiveQuery(() => db.words.orderBy("createdAt").reverse().toArray(), [])

  if (!words) return <div className="p-8 text-muted-foreground text-sm">Loading...</div>
  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-2 text-muted-foreground">
        <p className="text-sm">No words yet. Select text on any page and click the bookmark icon.</p>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Wordbook ({words.length})</h1>
      </div>
      <div className="divide-y">
        {words.map(w => (
          <div key={w.id} className="py-3 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-medium">{w.word}</span>
              {w.translation && <span className="text-sm text-muted-foreground">{w.translation}</span>}
              <span className="text-xs text-muted-foreground truncate">{w.context}</span>
            </div>
            <button
              type="button"
              className="text-xs text-destructive hover:underline shrink-0"
              onClick={() => db.words.delete(w.id!)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 5: GradeButtons 组件**

```tsx
// apps/extension/src/entrypoints/options/pages/review/grade-buttons.tsx
import type { ReviewGrade } from "@/utils/sm2"

interface GradeButtonsProps {
  onGrade: (grade: ReviewGrade) => void
  disabled?: boolean
}

const GRADES: { grade: ReviewGrade; label: string; className: string }[] = [
  { grade: "again", label: "Again", className: "bg-destructive/10 hover:bg-destructive/20 text-destructive" },
  { grade: "good", label: "Good", className: "bg-primary/10 hover:bg-primary/20 text-primary" },
  { grade: "easy", label: "Easy", className: "bg-green-500/10 hover:bg-green-500/20 text-green-700" },
]

export function GradeButtons({ onGrade, disabled }: GradeButtonsProps) {
  return (
    <div className="flex gap-3 justify-center">
      {GRADES.map(({ grade, label, className }) => (
        <button
          key={grade}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(grade)}
          className={`px-6 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

**Step 6: Flashcard 组件**

```tsx
// apps/extension/src/entrypoints/options/pages/review/flashcard.tsx
import { useState } from "react"
import type Word from "@/utils/db/dexie/tables/word"
import { GradeButtons } from "./grade-buttons"
import type { ReviewGrade } from "@/utils/sm2"

interface FlashcardProps {
  word: Word
  onGrade: (grade: ReviewGrade) => void
}

export function Flashcard({ word, onGrade }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false)

  return (
    <div className="flex flex-col items-center gap-6 max-w-lg mx-auto">
      <div
        className="w-full rounded-xl border bg-card p-8 text-center cursor-pointer min-h-48 flex flex-col items-center justify-center gap-3 select-none"
        onClick={() => setFlipped(f => !f)}
      >
        <p className="text-2xl font-semibold">{word.word}</p>
        {flipped && (
          <div className="flex flex-col gap-2 mt-2">
            {word.translation && (
              <p className="text-base text-muted-foreground">{word.translation}</p>
            )}
            {word.context && (
              <p className="text-sm text-muted-foreground italic border-t pt-2">{word.context}</p>
            )}
          </div>
        )}
        {!flipped && (
          <p className="text-xs text-muted-foreground mt-2">Click to reveal</p>
        )}
      </div>
      <GradeButtons onGrade={onGrade} disabled={!flipped} />
    </div>
  )
}
```

**Step 7: ReviewPage**

```tsx
// apps/extension/src/entrypoints/options/pages/review/index.tsx
import { useCallback, useEffect, useState } from "react"
import { reviewWord } from "@/utils/db/dexie/words"
import { getDueWords } from "@/utils/db/dexie/words"
import type Word from "@/utils/db/dexie/tables/word"
import type { ReviewGrade } from "@/utils/sm2"
import { Flashcard } from "./flashcard"

export function ReviewPage() {
  const [queue, setQueue] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getDueWords().then(words => {
      setQueue(words)
      setLoading(false)
      if (words.length === 0) setDone(true)
    })
  }, [])

  const handleGrade = useCallback(async (grade: ReviewGrade) => {
    const current = queue[0]
    if (!current) return
    await reviewWord(current.id!, grade)
    const next = queue.slice(1)
    setQueue(next)
    if (next.length === 0) setDone(true)
  }, [queue])

  if (loading) {
    return <div className="flex items-center justify-center p-16 text-muted-foreground text-sm">Loading...</div>
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-3">
        <p className="text-2xl">🎉</p>
        <p className="font-semibold">All done for today!</p>
        <p className="text-sm text-muted-foreground">Come back tomorrow for the next batch.</p>
      </div>
    )
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Review</h1>
        <span className="text-sm text-muted-foreground">{queue.length} left</span>
      </div>
      <Flashcard word={queue[0]} onGrade={handleGrade} />
    </div>
  )
}
```

**Step 8: 类型检查**
```bash
cd apps/extension && pnpm type-check
```

**Step 9: Commit**
```bash
git add apps/extension/src/entrypoints/options/ \
        apps/extension/src/locales/
git commit -m "feat(options): wordbook + review pages — SM-2 flashcard UI (M5 PR2 Task 2)"
```

---

## Task 3: Popup 复习入口按钮

**Files:**
- Create: `apps/extension/src/entrypoints/popup/components/review-entry-button.tsx`
- Modify: `apps/extension/src/entrypoints/popup/app.tsx`

**Step 1: 创建 ReviewEntryButton**

```tsx
// apps/extension/src/entrypoints/popup/components/review-entry-button.tsx
import { browser, i18n } from "#imports"
import { IconCards } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/base-ui/tooltip"
import { getDueWords } from "@/utils/db/dexie/words"

export function ReviewEntryButton() {
  const [dueCount, setDueCount] = useState(0)

  useEffect(() => {
    getDueWords().then(words => setDueCount(words.length))
  }, [])

  const handleClick = async () => {
    await browser.tabs.create({
      url: browser.runtime.getURL("/options.html") + "#/review",
    })
    window.close()
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" className="relative" onClick={handleClick} />}>
        <IconCards className="size-4.5" strokeWidth={1.6} />
        {dueCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
            {dueCount > 99 ? "99+" : dueCount}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {dueCount > 0
          ? i18n.t("popup.review.dueTooltip", { count: dueCount })
          : i18n.t("popup.review.tooltip")}
      </TooltipContent>
    </Tooltip>
  )
}
```

**Step 2: 在 popup/app.tsx 中注册**

在 `<TranslationHubButton />` 和 `<DiscordButton />` 之间加：
```tsx
import { ReviewEntryButton } from "./components/review-entry-button"
// ...
<ReviewEntryButton />
```

**Step 3: 加 i18n 字符串**

`en.json`: `"popup.review.tooltip": "Review Wordbook"`, `"popup.review.dueTooltip": "{{count}} words due for review"`
`zh-CN.json`: `"popup.review.tooltip": "复习生词"`, `"popup.review.dueTooltip": "{{count}} 个词待复习"`

**Step 4: 类型检查 + lint**
```bash
cd apps/extension && pnpm type-check && pnpm lint
```

**Step 5: Commit**
```bash
git add apps/extension/src/entrypoints/popup/ \
        apps/extension/src/locales/
git commit -m "feat(popup): review entry button with due-count badge (M5 PR2 Task 3)"
```

---

## Task 4: 全量测试

**Step 1:**
```bash
cd apps/extension && pnpm test --run
```
Expected: ≥ PR1 baseline + sm2 tests passing

**Step 2: 开 PR**

PR title: `feat(wordbook): SM-2 scheduler + review page + popup entry (M5 PR2)`
Base: `feat/m5-pr1-words-db`（或 main 合并后）
