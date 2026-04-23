# M5 PR3 — 导出 CSV + Obsidian Markdown 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-23-m5-wordbook-anki-design.md`
> **Predecessors:** PR2 (`feat/m5-pr2-review` merged)

**Goal:** 生词本导出功能：CSV（word, context, translation, interval, repetitions, nextReviewAt）和 Obsidian Markdown（每词一个 ## 块 + YAML frontmatter）。入口放在 Options → Wordbook 页面顶部工具栏。

**Architecture:** 纯浏览器端导出，无服务端依赖。导出函数生成 `Blob`，通过 `<a download>` 触发浏览器下载。Markdown 格式兼容 Obsidian Dataview 插件（frontmatter 字段）。

**Tech Stack:** React 19 · Dexie · Browser download API · vitest

---

## Preconditions

- Worktree: `.claude/worktrees/m5-pr3`，branch `feat/m5-pr3-export`
- Based on `feat/m5-pr2-review`（或 main 合并后 rebase）
- 阅读参考：
  - `apps/extension/src/entrypoints/options/pages/wordbook/index.tsx` — WordbookPage（PR2 产出）
  - `apps/extension/src/utils/db/dexie/tables/word.ts` — Word 类型

## Delivery

3 个 task。

---

## Task 1: 导出工具函数 + 单元测试

**Files:**
- Create: `apps/extension/src/utils/export/words-csv.ts`
- Create: `apps/extension/src/utils/export/words-markdown.ts`
- Create: `apps/extension/src/utils/export/__tests__/words-csv.test.ts`
- Create: `apps/extension/src/utils/export/__tests__/words-markdown.test.ts`

**Step 1: 写 CSV 测试**

```ts
// apps/extension/src/utils/export/__tests__/words-csv.test.ts
import { describe, expect, it } from "vitest"
import { wordsToCSV } from "../words-csv"

const SAMPLE = [
  {
    id: 1,
    word: "ephemeral",
    context: "An ephemeral moment.",
    sourceUrl: "https://example.com",
    translation: "短暂的",
    interval: 3,
    repetitions: 1,
    nextReviewAt: new Date("2026-05-04T00:00:00Z"),
    createdAt: new Date("2026-05-01T00:00:00Z"),
  },
  {
    id: 2,
    word: "word with, comma",
    context: 'context with "quotes"',
    sourceUrl: "https://example.com",
    translation: undefined,
    interval: 1,
    repetitions: 0,
    nextReviewAt: new Date("2026-05-02T00:00:00Z"),
    createdAt: new Date("2026-05-01T00:00:00Z"),
  },
]

describe("wordsToCSV", () => {
  it("includes a header row", () => {
    const csv = wordsToCSV(SAMPLE as never)
    const lines = csv.split("\n")
    expect(lines[0]).toBe("word,context,translation,interval,repetitions,nextReviewAt")
  })

  it("has one data row per word", () => {
    const csv = wordsToCSV(SAMPLE as never)
    const lines = csv.split("\n").filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 data
  })

  it("quotes fields containing commas", () => {
    const csv = wordsToCSV(SAMPLE as never)
    expect(csv).toContain('"word with, comma"')
  })

  it("escapes double quotes by doubling them", () => {
    const csv = wordsToCSV(SAMPLE as never)
    expect(csv).toContain('""quotes""')
  })

  it("leaves empty string for undefined translation", () => {
    const csv = wordsToCSV(SAMPLE as never)
    const lines = csv.split("\n")
    // second data row should have empty translation field
    expect(lines[2]).toMatch(/^"word with, comma"/)
    const fields = lines[2].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    expect(fields[2]).toBe("") // translation empty
  })
})
```

**Step 2: 写 Markdown 测试**

```ts
// apps/extension/src/utils/export/__tests__/words-markdown.test.ts
import { describe, expect, it } from "vitest"
import { wordsToMarkdown } from "../words-markdown"

const WORD = {
  id: 1,
  word: "ephemeral",
  context: "An ephemeral moment.",
  sourceUrl: "https://example.com",
  translation: "短暂的",
  interval: 3,
  repetitions: 1,
  nextReviewAt: new Date("2026-05-04T00:00:00Z"),
  createdAt: new Date("2026-05-01T00:00:00Z"),
}

describe("wordsToMarkdown", () => {
  it("includes YAML frontmatter block", () => {
    const md = wordsToMarkdown([WORD as never])
    expect(md).toContain("---")
    expect(md).toContain("word: ephemeral")
    expect(md).toContain("translation: 短暂的")
    expect(md).toContain("interval: 3")
    expect(md).toContain("repetitions: 1")
  })

  it("includes ## heading with the word", () => {
    const md = wordsToMarkdown([WORD as never])
    expect(md).toContain("## ephemeral")
  })

  it("includes context line", () => {
    const md = wordsToMarkdown([WORD as never])
    expect(md).toContain("An ephemeral moment.")
  })

  it("handles multiple words with separator", () => {
    const md = wordsToMarkdown([WORD as never, { ...WORD, id: 2, word: "serendipity" } as never])
    expect(md).toContain("## ephemeral")
    expect(md).toContain("## serendipity")
    expect(md.split("---").length).toBeGreaterThanOrEqual(3)
  })
})
```

**Step 3: 运行测试确认失败**
```bash
cd apps/extension && pnpm test --run src/utils/export/__tests__/
```

**Step 4: 实现 words-csv.ts**

```ts
// apps/extension/src/utils/export/words-csv.ts
import type Word from "@/utils/db/dexie/tables/word"

function csvField(value: string | undefined): string {
  const s = value ?? ""
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function wordsToCSV(words: Word[]): string {
  const header = "word,context,translation,interval,repetitions,nextReviewAt"
  const rows = words.map(w =>
    [
      csvField(w.word),
      csvField(w.context),
      csvField(w.translation),
      String(w.interval),
      String(w.repetitions),
      w.nextReviewAt.toISOString(),
    ].join(","),
  )
  return [header, ...rows].join("\n")
}

export function downloadCSV(words: Word[], filename = "wordbook.csv"): void {
  const csv = wordsToCSV(words)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

**Step 5: 实现 words-markdown.ts**

```ts
// apps/extension/src/utils/export/words-markdown.ts
import type Word from "@/utils/db/dexie/tables/word"

function wordToBlock(w: Word): string {
  const lines = [
    `## ${w.word}`,
    "",
    "---",
    `word: ${w.word}`,
    `translation: ${w.translation ?? ""}`,
    `interval: ${w.interval}`,
    `repetitions: ${w.repetitions}`,
    `nextReviewAt: ${w.nextReviewAt.toISOString().slice(0, 10)}`,
    `source: ${w.sourceUrl}`,
    "---",
    "",
    w.context ? `> ${w.context}` : "",
    "",
  ]
  return lines.join("\n")
}

export function wordsToMarkdown(words: Word[]): string {
  return words.map(wordToBlock).join("\n---\n\n")
}

export function downloadMarkdown(words: Word[], filename = "wordbook.md"): void {
  const md = wordsToMarkdown(words)
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

**Step 6: 运行测试确认通过**
```bash
cd apps/extension && pnpm test --run src/utils/export/__tests__/
```
Expected: 全部 PASS

**Step 7: Commit**
```bash
git add apps/extension/src/utils/export/
git commit -m "feat(export): words CSV + Obsidian Markdown export utilities (M5 PR3 Task 1)"
```

---

## Task 2: Wordbook 页面加导出工具栏

**Files:**
- Modify: `apps/extension/src/entrypoints/options/pages/wordbook/index.tsx`

**Step 1: 在 WordbookPage 顶部工具栏加导出下拉菜单**

```tsx
// 在 WordbookPage 的顶部 flex 行中，h1 旁边加导出按钮
import { downloadCSV } from "@/utils/export/words-csv"
import { downloadMarkdown } from "@/utils/export/words-markdown"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/base-ui/dropdown-menu"
import { Button } from "@/components/ui/base-ui/button"
import { IconDownload } from "@tabler/icons-react"

// 在 words.length > 0 分支的顶部 flex 行里：
<div className="flex items-center justify-between">
  <h1 className="text-lg font-semibold">Wordbook ({words.length})</h1>
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
      <IconDownload className="size-4 mr-1.5" strokeWidth={1.6} />
      Export
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => downloadCSV(words)}>
        Export as CSV
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => downloadMarkdown(words)}>
        Export as Markdown
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

**Step 2: 类型检查**
```bash
cd apps/extension && pnpm type-check
```

**Step 3: Commit**
```bash
git add apps/extension/src/entrypoints/options/pages/wordbook/index.tsx
git commit -m "feat(wordbook): add CSV + Markdown export menu to WordbookPage (M5 PR3 Task 2)"
```

---

## Task 3: 全量测试 + PR

**Step 1:**
```bash
cd apps/extension && pnpm test --run && pnpm lint
```

**Step 2: 开 PR**

PR title: `feat(wordbook): CSV + Obsidian Markdown export (M5 PR3)`
Base: `feat/m5-pr2-review`（或 main 合并后）
