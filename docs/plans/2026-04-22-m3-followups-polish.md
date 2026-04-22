# M3 Follow-ups · Polish PR — memory cleanup + font subset + scheduler back-off

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent:** `docs/plans/2026-04-21-m3-pdf-translate-design.md`

**Goal:** Close 3 non-blocking B2/B3/C review follow-ups in a single small PR.

**Architecture:** Three independent changes, each isolated enough to be its own task:
1. `overlayRoots` / `knownParagraphsRef` bounded LRU (main.ts) — prevent unbounded growth on 500+ page PDFs
2. Noto Sans CJK SC subset shrunk from 5MB → ~1.5MB via GB 2312 Level 1 char list (3755 most-common) — extension bundle size win
3. `TranslationScheduler` retry with exponential back-off on 429 / retriable errors — stability under rate-limited free providers

---

## Preconditions

- Worktree: `.claude/worktrees/m3-followups`, branch `feat/m3-followups-polish`
- Based on current `origin/main` (all 4 M3 PRs merged)
- `pnpm install` done
- Baseline: whatever main has (~1396 + any drift)

## Delivery

Single PR with 4 commits (3 tasks + changeset). Target ~300 LOC.

---

## Task 1: Memory cleanup for long-document sessions

**Goal:** When user has translated > N pages in one session, prune the oldest `overlayRoots` + `knownParagraphsRef` + `pendingSeq` + coordinator page state entries. Cache-hit on revisit is preserved (Dexie cache is not affected).

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/main.ts`
- Modify `apps/extension/src/entrypoints/pdf-viewer/translation/page-cache-coordinator.ts` (add `unloadPage(pageIndex)` method)
- Create or modify tests

**Approach:**
- Add `MAX_LIVE_PAGES = 50` constant
- On `textlayerrendered` for page N, track recency. When `overlayRoots.size > MAX_LIVE_PAGES`, unmount oldest pages (LRU).
- `coordinator.unloadPage(pageIndex)` deletes the per-page state; next visit fresh-starts (cache will rehydrate from Dexie).
- Bounds: 50 pages × (~Paragraph[] + React Root + Map entries) ≈ under 10MB heap.

**Tests (≥ 2):**
- Start 60 overlay pages → 50 retained, 10 oldest unmounted
- Re-visit an evicted page → overlay re-mounts fresh from cache

**Commit:** `perf(pdf-viewer): LRU cap on per-page memory (M3 follow-up 1)`

---

## Task 2: Shrink Noto Sans CJK subset to GB 2312 Level 1

**Goal:** Reduce font size from 5MB → ~1.5MB by limiting to 3755 most-common Chinese characters + Latin + kana + common punctuation. PDF export still covers 99.9% of Mandarin text.

**Files:**
- Replace `apps/extension/public/assets/fonts/noto-sans-cjk-sc-subset.otf` with smaller subset
- Update `apps/extension/public/assets/fonts/README.md` with new subsetting command

**Approach:**
1. Download GB 2312 Level 1 character list (hardcode 3755 chars into `--text-file`)
2. Re-run pyftsubset with `--text-file=gb2312-l1.txt` instead of the broad `--unicodes` range
3. Measure: expect 1.2-1.8MB
4. Verify common-test strings render correctly (visual spot check or pdf-lib test with known chars)

**Tests:**
- `font-path.test.ts` unchanged (path constant still valid)
- Manual: open a Chinese PDF, click export, verify output PDF opens in Preview with legible Chinese

**Commit:** `perf(pdf-viewer): shrink CJK font subset to GB 2312 Level 1 (M3 follow-up 2)`

---

## Task 3: Scheduler back-off on 429 + retriable errors

**Goal:** When a segment translation fails with 429 / 503 / network timeout, retry with exponential back-off (1s, 2s, 4s, 8s) up to 3 times before marking as error.

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/translation/scheduler.ts`
- Modify `scheduler.test.ts`

**Approach:**

Add retry config to `SchedulerDeps`:
```ts
retry?: {
  maxAttempts: number     // default 3
  baseDelayMs: number     // default 1000
  isRetriable: (err: unknown) => boolean   // default: 429 / 503 / network
}
```

In `runJob`, wrap `translate(text)` call:
```ts
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    const translation = await this.translate(text)
    // success
    return
  } catch (err) {
    if (!isRetriable(err) || attempt === maxAttempts - 1) throw
    const delay = baseDelayMs * Math.pow(2, attempt)
    await sleep(delay)
  }
}
```

Respect `controller.signal.aborted` between retries (abort cancels pending retries).

**Tests (≥ 3):**
- Fails once with 429, succeeds on retry → `done` status after one retry
- Fails 3 times → final status = `error`
- Non-retriable error (e.g. 400) → single attempt, no retry
- Abort during back-off sleep → retry cancelled

**Commit:** `feat(pdf-viewer): scheduler retry with exponential back-off (M3 follow-up 3)`

---

## Task 4: Changeset + PR

**Files:**
- Create `.changeset/m3-followups-polish.md`:

```md
---
"@getu/extension": patch
---

chore: M3 follow-ups — memory cleanup + font subset + scheduler back-off

- PDF viewer: bounded LRU on per-page overlay state; prevents memory growth
  on 500+ page documents
- CJK export font: shrunk from 5MB to ~1.5MB (GB 2312 Level 1); reduces
  extension bundle ~3.5MB
- Translation scheduler: automatic retry with exponential back-off on 429 /
  503 / network errors; up to 3 attempts; respects AbortSignal
```

**Final verification:**
```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension lint
pnpm --filter @getu/extension build
```

Expect tests ~1400+ (1396 + ~5-7 new). Build smaller by ~3.5MB.

**PR:** title `chore(pdf): M3 follow-ups — polish (memory + font + retry)`
Base: `main`

---

## Acceptance

- [ ] 3 task commits + 1 changeset commit
- [ ] Tests all green
- [ ] chrome-mv3 build ≥ 3MB smaller than prior main
- [ ] Memory test: 100-page fake PDF stays under cap
- [ ] Retry test: mocked 429 succeeds on 2nd attempt
- [ ] CI green → merge

## Out of scope (next PRs)

- Inline bounding-box export (PR 2)
- 7 locale translations (PR 3)
