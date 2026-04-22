# M3 Follow-ups · Inline Bounding-Box Export

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent:** `docs/plans/2026-04-21-m3-pdf-translate-design.md`

**Goal:** Replace the footer-only PDF export layout with **inline translation placement directly under each source paragraph**, using the bounding-box coordinates captured at aggregate time. Pro users get a proper "double-language" PDF instead of a footer block.

**Architecture:** Cache schema extends each `PdfTranslationParagraph` with an optional `boundingBox: { x, y, width, height }` in PDF units. Scheduler / coordinator capture the bbox when writing cache. `pdf-lib-writer` prefers inline draw-below for rows that have bbox; falls back to footer for legacy rows without. Cache version bumps (Dexie schema `v9`).

---

## Preconditions

- Worktree: `.claude/worktrees/m3-followups-inline`, branch `feat/m3-followups-inline-export`
- Based on `origin/main` (after #95 polish merged)
- Baseline: ~1419 passing

## Delivery

Single PR. 5 tasks + changeset.

---

## Task 1: Extend `PdfTranslationParagraph` schema with optional `boundingBox`

**Files:**
- Modify `apps/extension/src/utils/db/dexie/tables/pdf-translations.ts` — add `boundingBox?: BoundingBox` to the type
- Modify `apps/extension/src/utils/db/dexie/pdf-translations.ts` — no-op (helpers pass through)
- Modify `apps/extension/src/utils/db/dexie/app-db.ts` — schema version bump v8 → v9 (no index change, just the type shape changes; Dexie auto-migrates rows)
- Modify `apps/extension/src/utils/db/dexie/__tests__/pdf-translations.test.ts` — add a test that put/get round-trips boundingBox when present, and when absent

**Type shape:**

```ts
import type { BoundingBox } from "@/entrypoints/pdf-viewer/paragraph/types"

export interface PdfTranslationParagraph {
  srcHash: string
  translation: string
  boundingBox?: BoundingBox    // optional — legacy cache rows lack it
}
```

Import `BoundingBox` from the existing paragraph types (already defined in PR #B1 Task 1 as `{ x, y, width, height }` in PDF units).

**Commit:** `feat(db): extend pdfTranslation cache schema with optional bbox (M3 inline export 1)`

---

## Task 2: Capture boundingBox in PageCacheCoordinator when writing cache

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/translation/page-cache-coordinator.ts`
- Modify `apps/extension/src/entrypoints/pdf-viewer/translation/__tests__/page-cache-coordinator.test.ts`

In `PageState`, track `paragraphBoundingBoxes: BoundingBox[]` indexed by paragraph position (parallel to `translations`). Populate in `startPage` when receiving `paragraphs: Paragraph[]`. When writing the full-page cache row, include `boundingBox: state.paragraphBoundingBoxes[i]` for each paragraph.

**Tests:** update existing "writes cache row" test to assert boundingBox present on each paragraph in the written row.

**Commit:** `feat(pdf-viewer): capture bounding box in cache writes (M3 inline export 2)`

---

## Task 3: Inline draw in `pdf-lib-writer`

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/export/pdf-lib-writer.ts`
- Modify `apps/extension/src/entrypoints/pdf-viewer/export/__tests__/pdf-lib-writer.test.ts`

Replace the `drawFooterTranslations` helper with a dual-strategy draw:
1. If **all paragraphs on a page have boundingBox** — draw each translation **directly below** its source paragraph at `(bbox.x, bbox.y - translationHeight)` in PDF coords. Text color darker grey or similar to distinguish; auto-wrap within `bbox.width`.
2. If **any paragraph lacks boundingBox** (legacy cache) — fall back to the footer layout (unchanged for backward compat).

Per-page decision simplifies testing and avoids mixed layouts.

**Tests:**
- Inline draw path called for cache rows with full bbox coverage
- Footer fallback for rows missing any bbox
- Mixed (some paragraphs have bbox, some don't) — entire page falls back to footer
- CJK paragraphs with bbox render via CJK font, positioned correctly
- Draw coordinates match the expected `(bbox.x, bbox.y - textHeight)`

**Commit:** `feat(pdf-viewer): inline translation draw under source paragraphs (M3 inline export 3)`

---

## Task 4: Handle legacy cache rows (one-time migration or graceful)

**Decision:** Don't migrate. Legacy rows gracefully fall back to footer layout (Task 3 already handles this). Users who care about inline export can clear their cache (Options → Clear cache button, from M3 PR#C) and re-translate — the new rows will have bbox.

**File:** Add a short `MIGRATION.md` or inline comment in `pdf-translations.ts` explaining the behavior. No code change beyond comment.

**Commit:** (fold into Task 3 or skip as separate commit — choose based on cleanliness)

---

## Task 5: Changeset + final verify + PR

**Changeset:**

```md
---
"@getu/extension": patch
---

feat(pdf-viewer): inline bilingual PDF export

Pro-tier exported PDFs now place each translation **directly below its
source paragraph** using captured bounding-box coordinates, replacing the
earlier footer-only layout. Result: reading flow matches a native bilingual
document instead of cross-referencing a footnotes block.

- `PdfTranslationParagraph` schema gained optional `boundingBox`
  (Dexie schema v8 → v9; no data loss, legacy rows untouched)
- `PageCacheCoordinator` captures `boundingBox` when writing cache
- `pdf-lib-writer` prefers inline layout per page; legacy cache rows
  without bbox fall back to footer
- Users who want inline output for previously-cached PDFs: Options →
  "Clear cache" then re-translate
```

**Verify + push + PR.**

---

## Acceptance

- [ ] Tasks 1-5 each committed
- [ ] Tests ≥ 1430 (baseline 1419 + ~10 new from schema + coordinator + writer)
- [ ] type-check clean, lint clean, build OK
- [ ] Manual: export a fresh 5-page bilingual PDF → translations appear below each paragraph, not as footer
- [ ] Manual: legacy cache → export still works (footer fallback)

## Risk + fallback

| Risk | Mitigation |
|------|------------|
| Bounding boxes from PDF-unit coords don't translate cleanly to pdf-lib draw calls (coordinate system flip) | pdf-lib uses PDF native coords (y grows upward); aggregate stores in PDF units; should map directly. Verify with a real export. |
| Inline draw overlaps next paragraph when translation is longer than source | Wrap text to `bbox.width`; accept vertical overlap as known limitation (same issue the viewer overlay's push-down primitive solves — but push-down in exported PDF requires re-flowing the entire page, out of scope). Document. |
| Font metrics mismatch causes character clipping | Use `widthOfTextAtSize` before each line, break when exceeding `bbox.width - padding` |
