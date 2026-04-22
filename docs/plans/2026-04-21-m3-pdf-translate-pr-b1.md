# M3 · PR #B1 — 段落重组 + Overlay 骨架 · 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-21-m3-pdf-translate-pr-b-design.md`
> **Predecessor:** PR #A (`35418e5`) — viewer foundation, redirect, toast, options

**Goal:** Port BabelDOC paragraph detection to TS + build an independent overlay layer that reserves placeholder slots below each paragraph. No translation yet — slots display "[...]" placeholder. Zoom / scroll / page-navigation do not break overlay alignment.

**Architecture:** pdf.js textLayer emits `TextItem[]`; a pure `aggregate()` function groups them into `Paragraph[]` by font + vertical spacing + x-alignment heuristics (BabelDOC-inspired). An `OverlayLayer` React component, mounted once per page inside a sibling div of the textLayer, listens to pdf.js `textlayerrendered` events, consumes `Paragraph[]`, and absolute-positions a placeholder div below each paragraph. Height of placeholders accumulates to push per-page container height; subsequent pdf.js pages layout naturally below.

**Tech Stack:** pdfjs-dist 4.x · React 19 · pure TS for paragraph detection (no DOM dependencies)

---

## Preconditions

- Worktree: `.claude/worktrees/m3-pdf-translate-core`, branch `feat/m3-pdf-translate-core`
- Based on current `origin/main` (includes PR #A squash-merged as `35418e5`)
- `pnpm install` done
- Baseline `SKIP_FREE_API=true pnpm --filter @getu/extension test` green
- Familiarity with PR #A: `apps/extension/src/entrypoints/pdf-viewer/main.ts` calls `renderPdf(src)` which sets up `PDFViewer`, `EventBus`, `PDFLinkService`
- Read: parent design `docs/plans/2026-04-21-m3-pdf-translate-pr-b-design.md` (Architecture + Data flow sections)

## Delivery

Single PR `feat/m3-pdf-translate-core`. 5 tasks + changeset + final review (match PR #A's cadence). Stack on top of PR #A (already merged into main).

---

## Task 1: BabelDOC investigation + TextItem/Paragraph types

**Goal:** Decide exactly what to port from BabelDOC. Produce shared types.

### Step 1 — Investigate BabelDOC source

Clone or browse https://github.com/funstory-ai/BabelDOC. The relevant code is paragraph detection from layout elements. Likely locations:
- `babeldoc/translation_logic/` or similar
- Look for files mentioning `group_by_paragraph`, `detect_paragraph`, `line_break`, or `layout_analysis`

Produce a short investigation report in this doc (update Task 1 after investigation) describing:
- Which source files contain the algorithm
- The data shape BabelDOC operates on (equivalent to pdf.js `TextItem`?)
- Core heuristic rules (font size threshold, line-spacing threshold, x-alignment tolerance)
- Dependencies we DON'T port (layout / OCR / multi-page logic unrelated to paragraph detection)

Time-box: 2 hours. Report deviations from the pure-port approach if source is impractical (then fall back to self-written heuristic using BabelDOC rules as inspiration).

### Step 2 — Shared types

Create `apps/extension/src/entrypoints/pdf-viewer/paragraph/types.ts`:

```ts
// TextItem shape matches pdfjs-dist's `TextItem` from `pdfjs-dist/types/src/display/api`.
// We redeclare here with only the fields we use to avoid tying tests to pdfjs types.
export interface TextItem {
  str: string
  transform: [number, number, number, number, number, number]  // PDF matrix: sx, kx, ky, sy, tx, ty
  width: number
  height: number
  fontName: string
}

export interface Paragraph {
  /** Ordered list of items in reading order */
  items: TextItem[]
  /** Concatenated source text (with line breaks normalized) */
  text: string
  /** Bounding box in PDF viewer coordinates (CSS pixels) */
  boundingBox: { x: number, y: number, width: number, height: number }
  /** Dominant font size in CSS px (used for translation style matching later) */
  fontSize: number
  /** Globally stable key for atom indexing */
  key: string
}
```

**Step 3 — Commit**

```bash
git commit -m "feat(pdf-viewer): add paragraph types + babeldoc port investigation (M3 PR#B1 Task 1)"
```

---

## Task 2: Port paragraph aggregation algorithm

**Files:**
- Create `apps/extension/src/entrypoints/pdf-viewer/paragraph/aggregate.ts`
- Create `apps/extension/src/entrypoints/pdf-viewer/paragraph/__tests__/aggregate.test.ts`
- Create `apps/extension/src/entrypoints/pdf-viewer/paragraph/__tests__/fixtures/` with 5+ sample TextItem[] arrays from real PDFs

**Algorithm outline (BabelDOC-inspired):**

```ts
export function aggregate(items: TextItem[]): Paragraph[] {
  // 1. Sort items top-to-bottom, left-to-right
  // 2. Group into "lines" by y-coordinate proximity (tolerance = 0.3 * median line height)
  // 3. For each adjacent line pair, decide if they're same paragraph:
  //    - Same dominant font + font size
  //    - Vertical spacing < 1.5 * line height
  //    - Previous line doesn't end in ".?!:" AND next line doesn't start capitalized (language-dependent — start simple)
  //    - X-alignment: next line's left edge within 10% of previous line's left edge (not indented = continuation)
  // 4. Within a paragraph, concatenate text with single space (unless original had hyphenation at line end)
  // 5. Compute bounding box + dominant font size
  // 6. Generate stable key: `p-${pageIndex}-${paragraphIndex}`
}
```

### Step 1 — Fixtures

Create 5 fixture files with realistic `TextItem[]` dumps:
- `simple-paragraph.ts` — 3 lines of a single paragraph
- `multiple-paragraphs.ts` — 2 paragraphs separated by extra vertical space
- `heading-and-body.ts` — larger-font heading followed by smaller-font body
- `double-column.ts` — 2 columns on same page, 3 paragraphs each
- `line-continuation-hyphen.ts` — word hyphenated at line break
- (Optional bonus) `bullet-list.ts` — bullet points with bullet-marker indent

Create fixtures by running `pnpm dev` on a test PDF, dumping `textLayer` `TextItem[]` via a DevTools expression, and sanitizing. See `apps/extension/src/entrypoints/pdf-viewer/AGENTS.md` for dev setup.

### Step 2 — Failing tests

```ts
import { describe, expect, it } from "vitest"
import { aggregate } from "../aggregate"
import { simpleParagraph } from "./fixtures/simple-paragraph"
import { multipleParagraphs } from "./fixtures/multiple-paragraphs"
import { headingAndBody } from "./fixtures/heading-and-body"
import { doubleColumn } from "./fixtures/double-column"
import { lineContinuationHyphen } from "./fixtures/line-continuation-hyphen"

describe("paragraph aggregate", () => {
  it("groups 3 lines of same paragraph into 1 Paragraph", () => {
    const result = aggregate(simpleParagraph.items)
    expect(result).toHaveLength(1)
    expect(result[0].text).toMatch(/^The\s+quick/)
  })

  it("detects paragraph break via extra vertical space", () => {
    expect(aggregate(multipleParagraphs.items)).toHaveLength(2)
  })

  it("separates heading from body by font size", () => {
    const result = aggregate(headingAndBody.items)
    expect(result).toHaveLength(2)
    expect(result[0].fontSize).toBeGreaterThan(result[1].fontSize)
  })

  it("handles double-column: 6 paragraphs", () => {
    expect(aggregate(doubleColumn.items)).toHaveLength(6)
  })

  it("joins hyphenated line continuation", () => {
    const result = aggregate(lineContinuationHyphen.items)
    expect(result[0].text).toContain("understanding")   // "under-\nstanding" → "understanding"
    expect(result[0].text).not.toContain("- ")
  })
})
```

### Step 3 — Implementation

Pure TS. No browser APIs. BabelDOC-inspired heuristics with tunable constants at module top:

```ts
const LINE_Y_TOLERANCE_RATIO = 0.3
const PARAGRAPH_GAP_RATIO = 1.5
const COLUMN_ALIGNMENT_TOLERANCE = 0.1
const HYPHEN_CONTINUATION_RE = /-\s*$/
```

Commit only when all fixture tests pass; don't skip.

### Step 4 — Commit

```bash
git commit -m "feat(pdf-viewer): port babeldoc paragraph detection to TS (M3 PR#B1 Task 2)"
```

---

## Task 3: Overlay layer DOM infrastructure

**Goal:** Mount an `OverlayLayer` React component inside a sibling div of each pdf.js page's textLayer. The component reads `Paragraph[]` (from Task 2) and renders a placeholder div below each paragraph.

**Files:**
- Create `apps/extension/src/entrypoints/pdf-viewer/overlay/layer.tsx`
- Create `apps/extension/src/entrypoints/pdf-viewer/overlay/slot.tsx` (a single placeholder slot component)
- Create `apps/extension/src/entrypoints/pdf-viewer/overlay/__tests__/layer.test.tsx` (RTL smoke)
- Modify `apps/extension/src/entrypoints/pdf-viewer/main.ts` to mount one React root per page container on `textlayerrendered`

**DOM structure (per page):**

```
<div class="page" data-page-number="N">          <!-- pdf.js page container -->
  <canvas />                                      <!-- pdf.js rendered canvas -->
  <div class="textLayer">                         <!-- pdf.js textLayer spans -->
    <span style="top:...; left:...;">...</span>
    ...
  </div>
  <div class="getu-overlay" data-page-index="N">  <!-- our overlay, sibling of textLayer -->
    <div class="getu-slot" style="top:160px; left:72px; width:440px; min-height:40px">
      [placeholder]
    </div>
    <div class="getu-slot" ...>[placeholder]</div>
    ...
  </div>
</div>
```

- `.getu-overlay` is `position: absolute; inset: 0; pointer-events: none;`
- `.getu-slot` is `position: absolute;` with top/left/width computed from paragraph boundingBox
- Placeholder content: `[...]` (internationalization deferred — literal string OK for B1)
- `pointer-events: none` so user can still select original text via textLayer

**Implementation points:**
- `layer.tsx` accepts props `{ paragraphs: Paragraph[], pageIndex: number }` and renders one `<Slot/>` per paragraph
- `slot.tsx` is just a positioned div with `data-segment-key={paragraph.key}` so B2 can target it by key
- Use a simple per-page React root (`createRoot(overlayContainer).render(<OverlayLayer ... />)`), not a single global root. This isolates pages and simplifies unmount on page destruction

**Step 1 — Failing test (RTL smoke for `<OverlayLayer>`)**

```tsx
describe("OverlayLayer", () => {
  it("renders one slot per paragraph with data-segment-key", () => {
    const paragraphs = [
      makeFakeParagraph({ key: "p-0-0" }),
      makeFakeParagraph({ key: "p-0-1" }),
    ]
    const { container } = render(<OverlayLayer paragraphs={paragraphs} pageIndex={0} />)
    const slots = container.querySelectorAll("[data-segment-key]")
    expect(slots).toHaveLength(2)
    expect(slots[0].getAttribute("data-segment-key")).toBe("p-0-0")
    expect(slots[1].getAttribute("data-segment-key")).toBe("p-0-1")
  })

  it("positions slot absolutely below paragraph bounding box", () => {
    const paragraph = makeFakeParagraph({
      key: "p-0-0",
      boundingBox: { x: 72, y: 100, width: 440, height: 40 },
    })
    const { container } = render(<OverlayLayer paragraphs={[paragraph]} pageIndex={0} />)
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.style.left).toBe("72px")
    expect(slot.style.top).toBe("140px")  // y + height
  })

  it("renders placeholder text by default", () => {
    const { getByText } = render(<OverlayLayer paragraphs={[makeFakeParagraph()]} pageIndex={0} />)
    expect(getByText("[...]")).toBeInTheDocument()
  })
})
```

**Step 2 — Implement `OverlayLayer` + `Slot`**

**Step 3 — Integrate into main.ts (separate sub-step)**

Add this in `renderPdf()` after document is loaded:

```ts
viewer.eventBus.on("textlayerrendered", (event: { pageNumber: number, source: any }) => {
  const pageIndex = event.pageNumber - 1
  const pageContainer = event.source.div as HTMLElement     // pdf.js page container
  const textLayer = pageContainer.querySelector(".textLayer") as HTMLElement
  if (!textLayer) return

  // Extract TextItem[] from the page (pdf.js offers this via page.getTextContent())
  const page = await pdfDoc.getPage(event.pageNumber)
  const content = await page.getTextContent()
  const paragraphs = aggregate(content.items as TextItem[])

  // Mount overlay as sibling of textLayer
  let overlay = pageContainer.querySelector(".getu-overlay") as HTMLElement | null
  if (!overlay) {
    overlay = document.createElement("div")
    overlay.className = "getu-overlay"
    overlay.dataset.pageIndex = String(pageIndex)
    pageContainer.appendChild(overlay)
    const root = createRoot(overlay)
    root.render(<OverlayLayer paragraphs={paragraphs} pageIndex={pageIndex} />)
  }
})
```

Note: re-renders from zoom will fire `textlayerrendered` again. Our overlay div persists (same DOM node), but the React root inside may need to re-render with updated `paragraphs` reflecting new coordinates. Handle by re-invoking `root.render(...)` with fresh props.

**Step 4 — Tests pass + type-check**

**Step 5 — Commit**

```bash
git commit -m "feat(pdf-viewer): add overlay layer + placeholder slots (M3 PR#B1 Task 3)"
```

---

## Task 4: Position sync on zoom + page change

**Goal:** Overlay slot positions remain correct as the user zooms in/out or navigates between pages. pdf.js re-emits `textlayerrendered` on these events; our React re-render needs fresh coordinates.

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/overlay/layer.tsx` (prop changes to support key-based re-render)
- Modify `apps/extension/src/entrypoints/pdf-viewer/main.ts` (re-invoke `root.render` on each `textlayerrendered`)
- Create `apps/extension/src/entrypoints/pdf-viewer/overlay/position-sync.ts` (helper: compute CSS px from PDF transform matrix)
- Create `apps/extension/src/entrypoints/pdf-viewer/overlay/__tests__/position-sync.test.ts`

**Key insight:** pdf.js transforms PDF coordinates to CSS pixels via the current viewport scale. The `TextItem.transform` matrix `[sx, kx, ky, sy, tx, ty]` is in PDF units. To get CSS px, multiply by viewport `transform` matrix. `PDFPageView.viewport.transform(...)` gives the conversion.

```ts
// position-sync.ts
export function toCssCoords(
  item: TextItem,
  viewport: { transform: [number, number, number, number, number, number] },
): { left: number, top: number, width: number, height: number } {
  // Apply viewport transform to item.transform matrix
  ...
}
```

**Step 1 — Failing tests**

Write tests using hand-crafted matrices. Verify that with viewport scale=1.0 and scale=2.0, the resulting CSS coords are correct multiples.

**Step 2 — Implement `toCssCoords`**

**Step 3 — Wire into aggregate.ts OR overlay render**

Decision: paragraph bounding boxes should be in CSS px already, computed at detection time. Since we recompute paragraphs on each `textlayerrendered` event (which gives us fresh viewport), re-aggregation picks up scale changes automatically.

Simplify: `aggregate()` in Task 2 operates on PDF units; a separate `projectBoundingBoxesToCss(paragraphs, viewport)` step converts before handing to React. Refactor Task 2 accordingly.

**Step 4 — Manual smoke**

In `pnpm dev`:
- Open a PDF, confirm overlay slots appear
- Zoom in (Ctrl +) — slots should remain below paragraphs, proportionally sized
- Zoom out — same
- Flip to next page via pdf.js toolbar — next page's overlay appears fresh
- Flip back — cached overlay still aligned

**Step 5 — Commit**

```bash
git commit -m "feat(pdf-viewer): sync overlay coordinates on zoom + page change (M3 PR#B1 Task 4)"
```

---

## Task 5: Push-down layout primitive (empty slots push subsequent content)

**Goal:** Reserve vertical space below each paragraph equal to the placeholder slot's height. Since placeholders are empty `[...]`, min-height is small (~24px). When B2 populates them with translation text (potentially 40-120px tall per paragraph), the push-down mechanism is already wired.

**Files:**
- Modify `apps/extension/src/entrypoints/pdf-viewer/overlay/layer.tsx` to set slot `min-height` from a prop
- Create `apps/extension/src/entrypoints/pdf-viewer/overlay/push-down-layout.ts`
- Modify `pdf-viewer/main.ts` to adjust page container height based on accumulated slot heights
- Create `apps/extension/src/entrypoints/pdf-viewer/overlay/__tests__/push-down-layout.test.ts`

**Approach — per-page extended height:**

Each pdf.js `.page` container has a fixed height from PDF dimensions. To push subsequent pages down, we append extra height to this container equal to `Σ slotHeights - Σ gapsConsumed`:
- `slotHeights` = sum of our overlay slot heights
- `gapsConsumed` = vertical space already available between paragraphs (so we only "add" height beyond existing whitespace)

For B1 with empty placeholders, this simplifies: add `numParagraphs * MIN_SLOT_HEIGHT` to page container height. Actual translation push in B2 will be tighter (measures real slot heights post-render).

**Implementation:**

```ts
// push-down-layout.ts
export function computePageExtension(paragraphs: Paragraph[], minSlotHeight: number): number {
  // For B1 scaffolding: simple linear model, will refine in B2
  return paragraphs.length * minSlotHeight
}

// In main.ts after overlay mount:
const extension = computePageExtension(paragraphs, MIN_SLOT_HEIGHT)
pageContainer.style.paddingBottom = `${extension}px`
```

pdf.js's scroll logic uses page container `getBoundingClientRect().height`, so CSS padding is honored naturally. We don't touch pdf.js's internal page height assumptions; we only extend the visible container.

**Step 1 — Failing unit tests for `computePageExtension`**

```ts
it("returns 0 for zero paragraphs", () => {
  expect(computePageExtension([], 24)).toBe(0)
})
it("scales linearly with paragraph count", () => {
  expect(computePageExtension([p1, p2, p3], 24)).toBe(72)
})
```

**Step 2 — Implement + wire into main.ts**

**Step 3 — Manual smoke — "push-down is visible"**

With 1+ paragraph per page:
- Open PDF
- Scroll through pages — subsequent pages appear lower than vanilla pdf.js due to added padding
- Overlay placeholders visible in the padding zone
- pdf.js page-number indicator still accurate (dependent on `getBoundingClientRect`)

**Step 4 — Commit**

```bash
git commit -m "feat(pdf-viewer): push-down layout primitive for overlay slots (M3 PR#B1 Task 5)"
```

---

## Task 6: Changeset + PR

**Files:**
- Create `.changeset/m3-pdf-b1-paragraph-overlay.md`

```md
---
"@getu/extension": patch
---

feat: M3 PR#B1 — paragraph detection + overlay skeleton

- BabelDOC-inspired paragraph detection from pdf.js textLayer
- Independent overlay layer: placeholder `[...]` slots below each paragraph
- Zoom + page navigation preserve overlay alignment
- Push-down layout reserves vertical space for upcoming translation blocks
- No translation yet — PR #B2 wires the scheduler
```

**Verify all green:**

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension lint
pnpm --filter @getu/extension build
```

**Push + PR:**

```bash
git push -u origin feat/m3-pdf-translate-core
gh pr create --title "feat(pdf): M3 PR#B1 — paragraph detection + overlay skeleton" --body "..."
```

**Commit:**

```bash
git commit -m "chore(changeset): m3 pr#b1 paragraph detection + overlay"
```

---

## PR #B1 验收标准

- [ ] Tasks 1–6 complete, each its own commit
- [ ] New tests ≥ 15 (paragraph aggregation fixtures + overlay smoke + position-sync + push-down)
- [ ] `SKIP_FREE_API=true pnpm test && type-check && lint` all green
- [ ] Manual smoke: open 3 representative PDFs (simple, double-column, academic paper), confirm placeholder slots visible below paragraphs
- [ ] Zoom + page-nav + scroll do not break alignment
- [ ] Final code review via `codex:adversarial-review`
- [ ] Changeset committed

## 出 scope（PR #B2 / B3）

- Translation provider integration
- Progressive display of real translations
- Caching + quota
- UpgradeDialog integration
- "Accept" button wiring in first-use-toast

## 风险 + 回退

| 风险 | 缓解 |
|------|------|
| BabelDOC port proves impractical (Python-specific idioms, too much dep weight) | Task 1 investigation time-boxed to 2h; fallback to self-written heuristic using BabelDOC rule set as inspiration |
| pdf.js viewport.transform API differs from what documentation suggests | Read pdfjs-dist 4.x source directly under `node_modules/pdfjs-dist/types/src/display/api.d.ts`; verify with a dev-mode log before committing |
| Overlay React roots leak on page destruction | Track roots in a `Map<pageIndex, Root>`; on `pagechange` away from a page, call `root.unmount()` — but only if pdf.js actually destroys the page container; otherwise keep mounted |
| Placeholder push-down breaks pdf.js scroll-to-page | Task 5 smoke must verify; if broken, fall back to floating-below mode (`position: absolute` without extending height) and accept overlap as known limitation |
