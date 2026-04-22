# M3 · PR #B2 — 翻译 scheduler + 进度式渲染 · 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-21-m3-pdf-translate-pr-b-design.md`
> **Predecessor:** PR #B1 (branch `feat/m3-pdf-translate-core`, PR #78 — may still be OPEN when B2 starts; stack accordingly)

**Goal:** Wire real translations into the PR #B1 overlay. Segment-level scheduler with concurrency 6–8 + abort. Progressive React rendering — each translated paragraph replaces its `[...]` placeholder as soon as the provider returns. Push-down layout absorbs real text heights.

**Architecture:** A `TranslationScheduler` class owns a per-file queue keyed by `${fileHash}:${paragraph.key}`. Each queued segment calls `translateTextForPage(paragraph.text)` (reuses existing free/AI dispatch + skip-language + hash-cache from M1/M2). Results land in a `SegmentStatus` Jotai atom family. `OverlayLayer` subscribes via `useAtomValue` — when status → `done`, the slot renders the translation text instead of the placeholder. Layout pushes down naturally because slot content grows from empty to real text.

**Tech Stack:** Jotai atomFamily · existing `translateTextForPage` from `utils/host/translate/translate-variants.ts` · React 19 Suspense NOT required (atoms handle async state)

---

## Preconditions

- Worktree: `.claude/worktrees/m3-pdf-translate-core-b2`, branch `feat/m3-pdf-translate-b2`
- Based on `feat/m3-pdf-translate-core` (PR #B1). After PR #78 merges to main, rebase this branch onto main.
- Baseline: 1244 passing (PR #B1 HEAD)
- Read: `apps/extension/src/utils/host/translate/AGENTS.md` (pipeline entry points)
- Read: PR #B1's `apps/extension/src/entrypoints/pdf-viewer/AGENTS.md` (integration hook via `data-segment-key`)

## Delivery

Single stacked PR. 5 tasks + changeset + merge-gate review.

---

## Task 1: Segment status atom family + children prop on Slot

**Goal:** Unblock progressive rendering by (a) giving `<Slot>` a children prop (PR #B1 B2-follow-up #2), (b) adding the Jotai atom family for segment status.

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/overlay/slot.tsx` — add `children?: React.ReactNode`; replace hardcoded `[...]` with `children ?? "[...]"`
- Modify `apps/extension/src/entrypoints/pdf-viewer/overlay/layer.tsx` — optionally accept `renderSlotContent?: (paragraph) => ReactNode` and thread through
- Create `apps/extension/src/entrypoints/pdf-viewer/translation/atoms.ts` — export `segmentStatusAtomFamily` + types
- Create `apps/extension/src/entrypoints/pdf-viewer/translation/__tests__/atoms.test.ts`
- Modify `apps/extension/src/entrypoints/pdf-viewer/overlay/__tests__/layer.test.tsx` — verify children prop works
- Modify `apps/extension/src/entrypoints/pdf-viewer/overlay/__tests__/slot.test.tsx` (if exists) — verify children prop works

**atoms.ts shape:**

```ts
import { atomFamily } from "jotai/utils"
import { atom } from "jotai"

export type SegmentKey = string  // `${fileHash}:${paragraph.key}` per PR #B1 design

export type SegmentStatus =
  | { kind: "pending" }
  | { kind: "translating" }
  | { kind: "done", translation: string }
  | { kind: "error", message: string }

const INITIAL: SegmentStatus = { kind: "pending" }

export const segmentStatusAtomFamily = atomFamily((key: SegmentKey) =>
  atom<SegmentStatus>(INITIAL),
)
```

**Tests (atoms):** ≥ 3
- initial status is `pending`
- setting to `done` preserves translation
- same key returns same atom instance (atomFamily behavior)

**Commit:** `feat(pdf-viewer): add segment status atoms + slot children prop (M3 PR#B2 Task 1)`

---

## Task 2: Needed Jotai Provider in pdf-viewer

**Goal:** Today `main.ts` mounts React roots per page via `createRoot`. For atoms to cross page roots we need a shared Jotai Store. Add one at module init.

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/main.ts` — create a `pdfViewerStore = createStore()` at module scope; wrap each overlay root render with `<Provider store={pdfViewerStore}>`
- Update `overlay/layer.tsx` if it needs to receive the store (likely not — Provider handles it)
- Update overlay tests — pass `<Provider store={testStore}>` in `render()`

**Design rationale:** PR #B1 Task 4 review flagged the Jotai Provider gap as a B2 follow-up. The shared store means segment status atoms work across all page-level React roots. Per-file uniqueness is ensured via the atom key (`${fileHash}:${paragraph.key}`).

**Blocklist migration path** (B1 Task 4 deferral):
Now that there's a Provider, the `storageAdapter` direct write in `main.ts` can migrate to use `addDomainToBlocklistAtom`. Fold this into Task 2 commit — single commit `feat(pdf-viewer): mount jotai provider + migrate blocklist write to atom (M3 PR#B2 Task 2)`.

**Tests:** Update existing tests to work within a Jotai Provider. No new tests.

---

## Task 3: Translation scheduler

**Goal:** Orchestrate concurrent `translateTextForPage` calls with 6–8 concurrency, abort support, and status atom writes.

**Files:**
- Create `apps/extension/src/entrypoints/pdf-viewer/translation/scheduler.ts`
- Create `apps/extension/src/entrypoints/pdf-viewer/translation/__tests__/scheduler.test.ts`

**API:**

```ts
import type { Paragraph } from "../paragraph/types"
import type { SegmentKey, SegmentStatus } from "./atoms"

export interface SchedulerDeps {
  translate: (text: string) => Promise<string>  // inject for testability
  setStatus: (key: SegmentKey, status: SegmentStatus) => void
  concurrency: number                            // default 6
  signal?: AbortSignal
}

export class TranslationScheduler {
  constructor(deps: SchedulerDeps)
  enqueue(fileHash: string, paragraph: Paragraph): void
  abort(): void                                  // cancel all in-flight and pending
  size(): number                                 // pending + in-flight count
}
```

Internal: simple promise pool. On `enqueue`:
1. Set status to `translating` via `setStatus`
2. Queue (or start immediately if under concurrency)
3. When worker runs, `translate(text)` → on success set `done` with translation, on error set `error` with message
4. On abort, stop starting new work; in-flight continues but status writes are no-ops after `signal.aborted`

**Tests (scheduler):** ≥ 6
- enqueue one paragraph → status goes `pending → translating → done`
- translate fails → status goes to `error`
- enqueue 10 items with concurrency 2 → at any instant ≤ 2 `translating` concurrently
- abort before any start → no translate calls made
- abort mid-flight → in-flight may complete but new ones don't start
- same `fileHash:key` enqueued twice — dedupe or re-queue? **Dedupe** (first enqueue wins; second is no-op if already `done` or `translating`)

**Commit:** `feat(pdf-viewer): add translation scheduler (M3 PR#B2 Task 3)`

---

## Task 4: Integrate scheduler with existing translate pipeline + wire into main.ts

**Goal:** Hook the scheduler to `translateTextForPage` and kick it off when pages render.

**Files:**
- Create `apps/extension/src/entrypoints/pdf-viewer/translation/translate-segment.ts` — thin wrapper calling `translateTextForPage` with pdf-viewer-appropriate context
- Modify `apps/extension/src/entrypoints/pdf-viewer/main.ts`:
  - Instantiate one `TranslationScheduler` per file (on PDF open)
  - In `mountOverlayForPage`, after aggregating paragraphs, `scheduler.enqueue(fileHash, paragraph)` for each
  - Pass an `fileHash` to `mountOverlayForPage` — compute once on PDF open (PR #B3 refines with proper fingerprint; for B2 use a transient `src`-based hash like `sha256(src)`)

**Subtle: when to start scheduler**

- On first-use toast: only start scheduler when user clicks "Accept" (wire the `TODO(M3-PR-B)` marker in `first-use-toast.tsx`)
- On `activationMode === "always"`: start immediately after `renderPdf` completes
- On `activationMode === "manual"` or user opted out: never start

**Update `OverlayLayer`** to accept a `renderSlotContent(paragraph)` callback that reads `segmentStatusAtomFamily(key)` and returns the translation text (or placeholder if pending/translating/error).

**Tests:**
- Mock `translateTextForPage` → inject into scheduler → verify end-to-end paragraph → slot displays translation
- 1 integration-style test: enqueue paragraph, wait for status atom to flip to `done`, assert slot content

**Commit:** `feat(pdf-viewer): wire scheduler to translate pipeline + progressive render (M3 PR#B2 Task 4)`

---

## Task 5: Hook "Accept" button in first-use toast + smoke polish

**Goal:** Complete the TODO(M3-PR-B) in `first-use-toast.tsx` by triggering scheduler on Accept.

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/components/first-use-toast.tsx`:
  - Remove TODO(M3-PR-B) comment
  - Clicking Accept now calls an `onAccept` callback that main.ts provides, which starts the scheduler
- Modify `apps/extension/src/entrypoints/pdf-viewer/main.ts`:
  - When showing first-use toast, pass an `onAccept` that triggers the scheduler start
  - Remove the TODO from `onAccept` handler

**Tests:** Update first-use-toast tests to verify onAccept is invoked.

**Smoke polish:**
- Verify: open PDF → Accept → placeholders start filling in progressively
- Network slow: placeholders remain visible; user can still read original while waiting
- Long paragraph text: push-down layout absorbs the extra height (Task 5 primitive from B1 still works)

**Commit:** `feat(pdf-viewer): wire first-use-toast accept to scheduler (M3 PR#B2 Task 5)`

---

## Task 6: Changeset + PR

**Files:**
- Create `.changeset/m3-pdf-b2-scheduler.md`

```md
---
"@getu/extension": patch
---

feat: M3 PR#B2 — translation scheduler + progressive rendering

- `TranslationScheduler` with concurrency 6–8, abort, dedup
- Jotai Provider in pdf-viewer entrypoint (replaces direct storageAdapter writes for blocklist)
- `segmentStatusAtomFamily` drives per-segment UI state (pending → translating → done | error)
- Overlay slots render real translations progressively, replacing `[...]` placeholders
- First-use toast "Accept" now actually triggers translation
- No quota / cache yet — PR #B3 adds those
```

**Final verification:**
```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension lint
pnpm --filter @getu/extension build
```

**Push + PR:**
- If PR #78 is still open, set base branch `feat/m3-pdf-translate-core` (stacked)
- If PR #78 merged to main before B2 ready, rebase onto main first, then PR against main

Title: `feat(pdf): M3 PR#B2 — translation scheduler + progressive rendering`

**Commit:** `chore(changeset): m3 pr#b2 scheduler`

---

## PR #B2 验收标准

- [ ] Tasks 1–6 each its own commit
- [ ] New tests ≥ 15 (atoms, scheduler, integration smoke, slot children)
- [ ] `SKIP_FREE_API=true pnpm test && type-check && lint` green (2 pre-existing warnings OK)
- [ ] Manual smoke: open a real PDF, Accept toast, see paragraphs translate progressively within 5–15s
- [ ] Abort via browser back / tab close: translations stop cleanly (no orphan promises writing to unmounted React)
- [ ] Final merge-gate review via `code-reviewer` subagent

## 出 scope (PR #B3)

- File-hash cache (pdf_translations table, 30-day LRU)
- Daily quota counter (pdf_translation_usage table)
- `useProGuard('pdf_translate_unlimited')` hard-stop on 51st page
- UpgradeDialog integration

## 风险 + 回退

| 风险 | 缓解 |
|------|------|
| `translateTextForPage` isn't the right API (e.g. it does DOM manipulation) | Task 4 investigates first; if unsuitable, use `translateTextCore` directly or build a thin wrapper |
| Concurrency 6 exceeds some providers' rate limit | `translateTextForPage` already routes through provider-specific dispatch with health tracking (M1 Task 5); per-provider concurrency enforced there |
| Abort doesn't cleanly cancel in-flight fetch | fetch is passed through to provider-specific impl; if no signal support, scheduler marks as "superseded" via post-resolution dedup check |
| Atom family memory leak across file opens | B3 will add cleanup on file close; for B2 document as known leak with TODO(M3-PR-B3) marker |
