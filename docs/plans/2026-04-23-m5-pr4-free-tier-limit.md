# M5 PR4 — Free 100词限制 + UpgradeDialog 商业化 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-23-m5-wordbook-anki-design.md`
> **Predecessors:** PR3 (`feat/m5-pr3-export` merged)

**Goal:** 为生词本加 Free 100词上限：超限时拦截"加入生词本"并弹出 UpgradeDialog；Pro 用户无限制；Wordbook 页面展示额度进度条。

**Architecture:** `canAddWord()` 已在 PR1 实现（count < FREE_WORD_LIMIT）。Pro 判断通过现有 `useEntitlements` hook（与 M0 计费基建对齐）。UpgradeDialog 已有完整实现，只需传 `open/onOpenChange/source` props。

**Tech Stack:** React 19 · Jotai · existing billing hooks · vitest

---

## Preconditions

- Worktree: `.claude/worktrees/m5-pr4`，branch `feat/m5-pr4-free-tier`
- Based on `feat/m5-pr3-export`（或 main 合并后 rebase）
- 阅读参考文件：
  - `apps/extension/src/hooks/use-entitlements.ts` — Pro 判断
  - `apps/extension/src/components/billing/upgrade-dialog.tsx` — UpgradeDialog props
  - `apps/extension/src/entrypoints/selection.content/app.tsx` — UpgradeDialog 在 selection content 里的用法
  - `apps/extension/src/utils/db/dexie/words.ts` — canAddWord / FREE_WORD_LIMIT（PR1 产出）

## Delivery

3 个 task。

---

## Task 1: canAddWord 加 Pro 豁免 + 测试

**Files:**
- Modify: `apps/extension/src/utils/db/dexie/words.ts`
- Modify: `apps/extension/src/utils/db/dexie/__tests__/words.test.ts`

**Step 1: 修改 canAddWord 签名，接受 isPro 参数**

```ts
// 在 words.ts 中修改：
export async function canAddWord(isPro = false): Promise<boolean> {
  if (isPro) return true
  const count = await getWordCount()
  return count < FREE_WORD_LIMIT
}
```

**Step 2: 在测试文件中追加 Pro 豁免测试**

```ts
describe("canAddWord — Pro bypass", () => {
  it("always returns true when isPro=true regardless of count", async () => {
    countMock.mockResolvedValueOnce(999)
    expect(await canAddWord(true)).toBe(true)
  })

  it("does not call db.count when isPro=true", async () => {
    countMock.mockClear()
    await canAddWord(true)
    expect(countMock).not.toHaveBeenCalled()
  })
})
```

**Step 3: 运行测试**
```bash
cd apps/extension && pnpm test --run src/utils/db/dexie/__tests__/words.test.ts
```
Expected: 全部 PASS

**Step 4: Commit**
```bash
git add apps/extension/src/utils/db/dexie/words.ts \
        apps/extension/src/utils/db/dexie/__tests__/words.test.ts
git commit -m "feat(wordbook): canAddWord accepts isPro bypass for unlimited Pro tier (M5 PR4 Task 1)"
```

---

## Task 2: SaveWordButton 加限额拦截 + UpgradeDialog

**Files:**
- Modify: `apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/provider.tsx`
- Modify: `apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/index.tsx`

**Step 1: 在 provider.tsx 中加 isPro 判断 + upgradeDialogOpen 状态**

```tsx
// 修改 useSaveWord hook，加入 entitlements 检查：
import { useEntitlements } from "@/hooks/use-entitlements"
import { authClient } from "@/utils/auth/auth-client"
import { canAddWord } from "@/utils/db/dexie/words"

export function useSaveWord() {
  const selectionContent = useAtomValue(selectionContentAtom)
  const selectionContext = useAtomValue(selectionContextAtom)
  const [saved, setSaved] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const { translate } = useTranslation()

  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const { data: entitlements } = useEntitlements(userId)
  const isPro = entitlements?.pro ?? false

  const save = useCallback(async () => {
    if (!selectionContent) return

    const allowed = await canAddWord(isPro)
    if (!allowed) {
      setUpgradeOpen(true)
      return
    }

    const id = await addWord({
      word: selectionContent.trim(),
      context: selectionContext ?? "",
      sourceUrl: window.location.href,
    })

    setSaved(true)
    toast.success("已加入生词本")

    try {
      const result = await translate(selectionContent)
      if (result) await updateWordTranslation(id, result)
    }
    catch {
      // 翻译失败不影响保存结果
    }
  }, [selectionContent, selectionContext, translate, isPro])

  return { save, saved, hasSelection: Boolean(selectionContent?.trim()), upgradeOpen, setUpgradeOpen }
}
```

**Step 2: 在 index.tsx 中把 UpgradeDialog 挂载到按钮旁边**

```tsx
// 修改 SaveWordButton，接收 upgradeOpen/setUpgradeOpen，渲染 UpgradeDialog：
import { UpgradeDialog } from "@/components/billing/upgrade-dialog"

export function SaveWordButton() {
  const { save, saved, hasSelection, upgradeOpen, setUpgradeOpen } = useSaveWord()
  const label = saved ? i18n.t("wordbook.saved") : i18n.t("wordbook.save")

  return (
    <>
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
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        source="wordbook_limit"
      />
    </>
  )
}
```

**Step 3: 类型检查**
```bash
cd apps/extension && pnpm type-check
```

**Step 4: Commit**
```bash
git add apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/
git commit -m "feat(wordbook): free-tier 100-word limit + UpgradeDialog on SaveWordButton (M5 PR4 Task 2)"
```

---

## Task 3: Wordbook 页面加额度进度条 + 全量测试

**Files:**
- Modify: `apps/extension/src/entrypoints/options/pages/wordbook/index.tsx`

**Step 1: 在 WordbookPage 中加 Free 额度进度条**

仅在非 Pro 且词数 > 70 时显示（避免 Pro 用户看到无意义的进度条）：

```tsx
import { useEntitlements } from "@/hooks/use-entitlements"
import { authClient } from "@/utils/auth/auth-client"
import { FREE_WORD_LIMIT } from "@/utils/db/dexie/words"

// 在 WordbookPage 内：
const session = authClient.useSession()
const userId = session?.data?.user?.id ?? null
const { data: entitlements } = useEntitlements(userId)
const isPro = entitlements?.pro ?? false

// 在顶部工具栏下方，仅当 !isPro 且 words.length > FREE_WORD_LIMIT * 0.7 时显示：
{!isPro && words.length > FREE_WORD_LIMIT * 0.7 && (
  <div className="flex flex-col gap-1">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{words.length} / {FREE_WORD_LIMIT} words (Free)</span>
      {words.length >= FREE_WORD_LIMIT && (
        <span className="text-destructive font-medium">Limit reached — upgrade to Pro for unlimited</span>
      )}
    </div>
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(100, (words.length / FREE_WORD_LIMIT) * 100)}%` }}
      />
    </div>
  </div>
)}
```

**Step 2: 全量测试**
```bash
cd apps/extension && pnpm test --run && pnpm lint
```
Expected: ≥ PR1 baseline + PR2 sm2 tests + PR3 export tests，全部通过

**Step 3: Commit**
```bash
git add apps/extension/src/entrypoints/options/pages/wordbook/index.tsx
git commit -m "feat(wordbook): free-tier quota progress bar in WordbookPage (M5 PR4 Task 3)"
```

**Step 4: 开 PR**

PR title: `feat(wordbook): Free 100-word limit + UpgradeDialog + quota progress bar (M5 PR4)`
Base: `feat/m5-pr3-export`（或 main 合并后）

---

## M5 完整交付

4 个 PR 全部合并后，M5 生词本 + Anki 闭环完成：

| 功能 | 状态 |
|------|------|
| Dexie words 表（v10） | ✅ PR1 |
| 划词工具栏"加入生词本"按钮 | ✅ PR1 |
| 简化 SM-2 调度算法 | ✅ PR2 |
| options 生词本列表页 | ✅ PR2 |
| options 今日复习闪卡页 | ✅ PR2 |
| popup 复习入口按钮 | ✅ PR2 |
| CSV 导出 | ✅ PR3 |
| Obsidian Markdown 导出 | ✅ PR3 |
| Free 100词限制 | ✅ PR4 |
| UpgradeDialog 拦截 | ✅ PR4 |
| Pro 无限 | ✅ PR4 |
| 云同步 | 留 M10 WebDAV |
| Anki .apkg | 留 M5.1 |
