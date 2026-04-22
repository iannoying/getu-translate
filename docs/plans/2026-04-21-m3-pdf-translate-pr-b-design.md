# M3 PR #B · 核心翻译 + 配额 · 设计文档

> **Parent design:** `docs/plans/2026-04-21-m3-pdf-translate-design.md`
> **Parent roadmap:** `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md` → M3
> **Predecessor:** PR #A (merged as commit `35418e5`) — viewer foundation, redirect, toast, options
> **Status:** Brainstormed 2026-04-21
> **Delivery:** 3 stacked PRs (B1, B2, B3), each its own writing-plans pass

## Goal

Ship the core bilingual translation experience on top of PR #A's PDF viewer foundation:

1. Detect paragraphs from pdf.js `textLayer` output (not raw spans) so translation units are semantically complete.
2. Render a second-language overlay underneath each source paragraph, pushing subsequent content down so text reads naturally top-to-bottom in both languages.
3. Auto-translate the entire document progressively on open; show each segment as its provider call returns.
4. Cache translations by file fingerprint + page index (30-day LRU) so re-opening a PDF is zero-cost.
5. Enforce Free-tier quota: 50 pages/day counted on translation success; hard-stop + UpgradeDialog on 51st.

## Non-Goals (deferred to PR #C or later)

| Item | Reason | Target |
|------|--------|--------|
| Pro export to bilingual PDF (`pdf-lib` writeback) | Separate UX + CJK font embedding scope | PR #C |
| Free-tier watermark | UI polish, not functional | PR #C |
| Options → PDF → cache management / usage display | Settings page polish | PR #C |
| Multi-column / table / equation paragraph fidelity | Heuristic limits, acceptable degradation | Known limitation, doc in AGENTS.md |
| OCR for image-only PDFs | Out of M3 scope | M8 |
| iframe-embedded PDFs | Separate redirect path | M3.5 |

## Key Decisions (from brainstorming)

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| 1 | Paragraph reassembly | **Port BabelDOC Python detection to TS** | GPLv3 compatible; better quality than self-written heuristic for double-column / complex layouts |
| 2 | Overlay DOM | **Independent overlay layer, position-synced with textLayer; push subsequent content down** | pdf.js doesn't see our DOM; layout stays correct under zoom/scroll |
| 3 | Rendering rhythm | **Progressive** — each segment appears as soon as provider returns | Matches immersive-translate UX; first page visible in 2-3s even on 100-page PDFs |
| 4 | Quota exhaustion behavior | **Hard stop**: abort all in-flight + queued, pop UpgradeDialog | Simpler; matches "50/day" promise literally; aligns with M2 input-translate pattern |
| 5 | Delivery | **3 stacked PRs (B1, B2, B3)** | Each ~2-3 days, own review, own value milestone |

## Architecture

### Module layout (new additions on top of PR #A)

```
apps/extension/src/
├─ entrypoints/
│  └─ pdf-viewer/
│     ├─ main.ts                    [MODIFY]  wire paragraph detection + scheduler + overlay layer
│     ├─ paragraph/                 [NEW]     BabelDOC port + tests
│     │  ├─ aggregate.ts
│     │  ├─ types.ts                          TextItem → Paragraph types
│     │  └─ __tests__/
│     │     └─ fixtures/                     pdf.js textLayer dumps
│     ├─ overlay/                   [NEW]     overlay layer infrastructure
│     │  ├─ layer.tsx                         React component mounted in its own root
│     │  ├─ position-sync.ts                  sync logic vs textLayer events
│     │  └─ push-down-layout.ts               per-page extended layout
│     ├─ translation/               [NEW]     scheduler + progressive display
│     │  ├─ scheduler.ts                      segment queue, concurrency 6-8, abort
│     │  ├─ atoms.ts                          Jotai atoms: segment status map
│     │  └─ __tests__/
│     └─ quota/                     [NEW]     PR #B3
│        └─ use-pdf-quota.ts
├─ utils/
│  ├─ pdf/
│  │  ├─ fingerprint.ts             [NEW]     file hash util
│  │  ├─ domain.ts                  [EXISTS]  from PR #A
│  │  └─ __tests__/
│  └─ db/dexie/tables/
│     ├─ pdf-translations.ts        [NEW]     D2 cache table
│     └─ pdf-translation-usage.ts   [NEW]     daily quota counter
packages/definitions/src/pdf/       [NEW]     constants e.g. FREE_PDF_PAGES_PER_DAY=50
```

### Data flow (one page translation)

```
pdf.js renders page N
  → textlayerrendered event
      → extract TextItem[] from textLayer
        → aggregate.ts produces Paragraph[]
          → for each paragraph:
              scheduler.enqueue(paragraph, pageIndex)
              overlay.reserveSlot(paragraph, pageIndex)   // empty placeholder slot
  → scheduler pulls with concurrency 6-8
      → for each paragraph: call translateSegments(text)
          → on success: cache.put + quota.increment + atom.set(status: done, translation)
          → on failure: atom.set(status: error)
  → overlay React subscribes to atom
      → renders translation text in the reserved slot when status=done
        → triggers layout measurement → push-down pushes subsequent content
```

### Jotai atoms

```ts
// Map keyed by "${fileHash}:${pageIndex}:${paragraphIndex}"
type SegmentKey = string
type SegmentStatus =
  | { kind: "pending" }
  | { kind: "translating" }
  | { kind: "done"; translation: string }
  | { kind: "error"; message: string }

export const segmentStatusAtomFamily = atomFamily(
  (key: SegmentKey) => atom<SegmentStatus>({ kind: "pending" }),
)
```

### D2 cache schema (Dexie)

```ts
// pdf_translations
interface PdfTranslationRow {
  id: string                          // `${fileHash}:${pageIndex}`
  fileHash: string                    // indexed
  pageIndex: number
  targetLang: string                  // cache is lang-scoped
  providerId: string                  // cache is provider-scoped
  paragraphs: Array<{
    srcHash: string                   // SHA-256 of source text
    translation: string
  }>
  createdAt: number                   // indexed for LRU
  lastAccessedAt: number              // indexed
}

// pdf_translation_usage (mirrors M2's input_translation_usage)
interface PdfUsageRow {
  dateKey: string                     // "YYYY-MM-DD" local
  count: number
}
```

Cache key includes `targetLang + providerId` so switching language/provider doesn't serve stale translations. Prompt version is NOT keyed — invalidate manually via "Clear PDF translation cache" action (in Options, PR #C).

### Quota accounting (Q2 semantics)

- **Increment on page success**: when the last paragraph of a page lands, `recordPageSuccess()` runs once per page.
- **Cache hit doesn't count**: if all paragraphs of a page are served from cache, page is not counted.
- **Partial page**: if some paragraphs translated fresh and others from cache, still counts as 1 page (conservative).
- **Failure doesn't count**: abort / network error / blocked provider → no increment.

## Risks

| Risk | Mitigation |
|------|-----------|
| BabelDOC Python port has subtle bugs vs source | Use BabelDOC test fixtures directly; compare paragraph output |
| Push-down layout breaks pdf.js scroll / search | Extend per-page container height additively; don't touch pdf.js internals; fallback to "floating below" mode for unstable pages |
| Concurrency 6-8 rate-limits free providers | Respect per-provider concurrency (Bing: 4, Google: 6, etc.); check existing `translateSegments` pipeline for this |
| Cache table grows unbounded | 30-day LRU on `lastAccessedAt`; trigger eviction in background alarm (reuse M0 db-cleanup pattern); per-user max ~500MB soft cap |
| Progressive render layout thrash | Measure + reserve slot height upfront based on source paragraph length × expansion ratio (Chinese → English ~1.5x, etc.); final layout reflow accepts mild jitter |
| Abort mid-translation leaves dangling cache entry | Only `cache.put` after full page success; partial pages discarded |

## Delivery: 3 stacked PRs

### PR #B1 · 段落重组 + Overlay 骨架

**Scope:**
- Port BabelDOC paragraph detection (Python → TS)
- Overlay layer infrastructure (DOM mount + position sync with `textlayerrendered`)
- Placeholder slot reservation (empty divs, no translation)
- Zoom / scroll don't break layout

**Out of scope:** translation, caching, quota.

**Acceptance:** Open any PDF, placeholder `[...]` divs appear below each detected paragraph; zoom/scroll stay aligned; unit tests for paragraph detection cover 5+ representative layouts.

### PR #B2 · 翻译 scheduler + 进度式渲染

**Depends on:** B1 merged
**Scope:**
- Segment-level scheduler (concurrency 6-8, abort, error handling)
- Integrate existing `translateSegments` pipeline
- Progressive React rendering of translation text into placeholder slots
- Per-segment status atoms
- Layout push-down when segment `done`

**Out of scope:** caching, quota.

**Acceptance:** Real PDF opens → all paragraphs show English → target-lang pairs within 5-15 seconds; error states visible as "⚠ failed"; aborting via browser back button cancels in-flight.

### PR #B3 · D2 缓存 + 配额 + UpgradeDialog

**Depends on:** B2 merged
**Scope:**
- `pdf_translations` + `pdf_translation_usage` Dexie tables
- `utils/pdf/fingerprint.ts` file hash
- Hook `useProGuard('pdf_translate_unlimited')` for quota enforcement
- Scheduler cache-first lookup + cache write on success
- Hard-stop on 51st page with UpgradeDialog
- Wire toast "Accept" button to trigger translation (TODO(M3-PR-B) in pdf-viewer/main.ts + first-use-toast.tsx)

**Out of scope:** Options cache/usage UI (PR #C).

**Acceptance:**
- Free: translate 51 pages → blocked + UpgradeDialog; 1-50 continue visible
- Re-open same file → 0 quota consumed, instant from cache
- Pro → no limit
- Switching target language → fresh translations (cache-key miss)
- Toast "Accept" actually triggers translation (no longer a TODO stub)

## Follow-ups (PR #C)

- Pro export to bilingual PDF via `pdf-lib` (CJK font embedding)
- Free-tier watermark (viewer overlay corner)
- Options → PDF settings page additions: cache size + clear button, today's usage
- i18n 8-locale completion of all hardcoded strings added in B1–B3

---

**Next step:** Run `superpowers:writing-plans` for PR #B1 (paragraph reassembly + overlay skeleton). Subagent-driven execution follows.
