/**
 * Paragraph aggregation for pdf.js `TextItem[]`.
 *
 * ## BabelDOC port investigation (M3 PR #B1 Task 1)
 *
 * Reference source: https://github.com/funstory-ai/BabelDOC
 *
 * Files consulted:
 * - `babeldoc/format/pdf/document_il/midend/paragraph_finder.py` — `ParagraphFinder`,
 *   `_group_characters_into_paragraphs`, `_split_paragraph_into_lines`,
 *   `merge_alternating_line_number_paragraphs`, `process_independent_paragraphs`.
 * - `babeldoc/format/pdf/document_il/utils/paragraph_helper.py` —
 *   `is_cid_paragraph`, `is_pure_numeric_paragraph`, `is_placeholder_only_paragraph`.
 * - `babeldoc/format/pdf/document_il/utils/layout_helper.py` — `is_bullet_point`,
 *   `is_text_layout`, `get_character_layout`, `SPACE_REGEX`, `HEIGHT_NOT_USFUL_CHAR_IN_CHAR`.
 *
 * ## Port approach: **BabelDOC-inspired self-written heuristic**
 *
 * A verbatim port is impractical for three reasons:
 *
 * 1. **Granularity mismatch.** BabelDOC starts from `PdfCharacter` (one glyph per
 *    item) produced by pdfminer. pdf.js emits `TextItem` at run granularity —
 *    typically one item per visual line (sometimes per word). Character-level
 *    collision-histogram line-threading has no equivalent here because the
 *    lines are already pre-grouped by pdf.js.
 * 2. **Heavy dependencies.** BabelDOC's paragraph boundaries are seeded by
 *    a YOLO layout-detection model (see `doclayout.py` → `docvision/`) that
 *    produces `page.page_layout` — a list of typed bounding boxes (text,
 *    formula, title, figure). `_group_characters_into_paragraphs` uses that
 *    layout index to decide paragraph breaks. We have no such layout oracle
 *    in the browser; shipping a YOLO model through pdf.js would blow past the
 *    extension's MV3 code-size budget.
 * 3. **Data-model mismatch.** The Python code operates on `PdfParagraph` /
 *    `PdfParagraphComposition` / `PdfLine` trees driven by `numpy` histograms.
 *    Porting those primitives without their numerical libraries would be a
 *    large surface area with no payoff.
 *
 * ### Rules adopted from BabelDOC (adapted to pdf.js TextItem granularity)
 *
 * | BabelDOC rule | Adoption in this file |
 * | --- | --- |
 * | Paragraph break on layout-id change | Replaced with **x-indent change + vertical-gap jump** (proxy for "left a text layout") |
 * | Paragraph break on xobject change | N/A — pdf.js does not expose xobject grouping |
 * | Line clustering by y-proximity with mid-line distance < char height | Adopted verbatim — `LINE_Y_TOLERANCE_RATIO` of the median line height |
 * | Paragraph break on vertical gap > line height | Adopted — `PARAGRAPH_GAP_RATIO` (1.5×) |
 * | Paragraph break when `is_bullet_point()` starts a line | Adopted — `BULLET_PATTERN` regex |
 * | `process_independent_paragraphs` — split on table-of-contents dot leaders | Adopted — `TOC_DOT_LEADER` regex |
 * | Split when prev line width < `short_line_split_factor * median_width` | **Dropped for PR #B1** — deferred; needs median-width computation and mostly affects last-line detection, which is orthogonal to the B1 scaffolding goal |
 * | Character-level collision histogram for line splitting | **Dropped** — pdf.js `TextItem` is already per-line; clustering by y-center + tolerance suffices |
 * | YOLO-driven layout preprocessing (`_preprocess_formula_layouts`, etc.) | **Dropped** — not available |
 * | `merge_alternating_line_number_paragraphs` (A-L-A → A-L-A merge) | **Dropped for PR #B1** — deferred to later (requires line-number detection that is layout-aware) |
 * | `fix_overlapping_paragraphs` (iterative midpoint adjustment) | **Dropped for PR #B1** — pdf.js textLayer does not overlap in the common case |
 * | Hyphen continuation at line end (`"under-\nstanding"` → `"understanding"`) | Adopted — `HYPHEN_CONTINUATION_RE` |
 * | Font size change triggers paragraph break (heading vs body) | Adopted — `FONT_SIZE_CHANGE_RATIO` |
 *
 * ### Known limitations (flagged for future work)
 *
 * - **Double-column detection is geometric only.** We break on large x-indent
 *   jumps between lines. Overlapping columns (rare in modern PDFs) or
 *   narrow-column asides next to wide body text can misgroup. A future pass
 *   could adopt BabelDOC's median-line-width heuristic to distinguish
 *   column-start from regular short-last-lines.
 * - **No table handling.** BabelDOC routes tables through a separate
 *   `table_parser.py` stage. Tables here will be treated as many tiny
 *   paragraphs; acceptable for B1 since we don't translate table cells.
 * - **No equation / formula detection.** Inline math will be treated as normal
 *   text items. Display equations will likely form their own paragraph due to
 *   the vertical gap, which is acceptable for B1.
 * - **`transform[3]` sign assumption.** We assume pdf.js emits a positive `sy`
 *   in its normalised output (per `pdfjs-dist` 4.x observation); a negative
 *   `sy` would invert the y-axis ordering. If that ever surfaces, wrap the
 *   input in `Math.abs()` at the ingest boundary.
 */

import type {
  AggregateOptions,
  BoundingBox,
  Paragraph,
  TextItem,
} from "./types"

// --- tunable constants (adopted from BabelDOC where noted) ----------------

/** Items whose y-centers are within `ratio * medianLineHeight` belong to the same line. */
const LINE_Y_TOLERANCE_RATIO = 0.5

/** Vertical gap between adjacent lines exceeding this many × line height ⇒ paragraph break. */
const PARAGRAPH_GAP_RATIO = 1.5

/** X-indent difference (in PDF units) beyond which we treat adjacent lines as different columns/paragraphs. */
const COLUMN_X_JUMP_RATIO = 4

/** Font-size ratio change between adjacent lines that triggers a paragraph break. */
const FONT_SIZE_CHANGE_RATIO = 0.15

/**
 * Regex: line ends with a hyphen-then-whitespace (or just hyphen) ⇒ glue next
 * line's first word. Matches prefixes of any length (including single letters
 * like `"re-"`) to avoid leaving stray `"- "` artefacts when joining.
 */
const HYPHEN_CONTINUATION_RE = /([A-Z]+)-\s*$/i

/** Regex: paragraph-starting bullet/enumeration markers. Adopted from BabelDOC `is_bullet_point`. */
const BULLET_PATTERN = /^\s*(?:[\u2022\u25E6\u2023\u2043\u204C\u204D\u2219\u25AA\u25AB\u25CB\u25CF\u25A0\u25A1\u25B8\u25B9\u25C6\u25C7\-*]|\d+[.)]|[a-z][.)])\s+/i

/** Regex: table-of-contents dot leader. Adopted from BabelDOC `process_independent_paragraphs`. */
const TOC_DOT_LEADER = /\.{20,}/

// --- internal line representation -----------------------------------------

interface Line {
  items: TextItem[]
  /** Line text (items joined with a single space, trimmed). */
  text: string
  /** Max font size of any item in the line (PDF units). */
  fontSize: number
  /** Median x of the leftmost glyph (in PDF units). */
  left: number
  /** Rightmost edge (in PDF units). */
  right: number
  /** y-coordinate of the baseline (PDF units, items share `ty`). */
  baselineY: number
  /** y-center = baselineY + height/2 (PDF units). */
  centerY: number
  /** Line height (PDF units). */
  height: number
}

// --- helpers ---------------------------------------------------------------

function itemLeft(item: TextItem): number {
  return item.transform[4]
}

function itemBaselineY(item: TextItem): number {
  return item.transform[5]
}

function itemFontSize(item: TextItem): number {
  // transform[3] is sy (effective font size). Take absolute value to guard
  // against PDFs whose content stream emits a negative y-scale; pdf.js usually
  // normalises this already but belt-and-braces.
  return Math.abs(item.transform[3]) || item.height
}

function itemRight(item: TextItem): number {
  return itemLeft(item) + item.width
}

function median(values: number[]): number {
  if (values.length === 0)
    return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Round to 2 decimal places to avoid float jitter in test assertions. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Ratio of item height used as the inter-item x-gap threshold when deciding
 * whether two same-baseline items belong to different columns.
 *
 * A large horizontal gap (much bigger than any inter-word space) between
 * consecutive items on the same baseline usually means a column gutter; we
 * use 6× item height as the cutoff (~72 pt at 12 pt body text, wider than
 * any reasonable inter-word space pdf.js emits).
 */
const COLUMN_GAP_RATIO = 6

/**
 * Build a single `Line` from a cluster of items (will be x-sorted internally).
 */
function buildLine(cluster: TextItem[]): Line {
  const sorted = [...cluster].sort((a, b) => itemLeft(a) - itemLeft(b))
  const fontSizes = sorted.map(itemFontSize)
  const heights = sorted.map(i => i.height || itemFontSize(i))
  const height = Math.max(...heights)
  const baselineY = median(sorted.map(itemBaselineY))
  const fontSize = Math.max(...fontSizes)
  const left = Math.min(...sorted.map(itemLeft))
  const right = Math.max(...sorted.map(itemRight))
  const text = sorted.map(i => i.str).join("").replace(/\s+/g, " ").trim()
  return {
    items: sorted,
    text,
    fontSize,
    left,
    right,
    baselineY,
    centerY: baselineY + height / 2,
    height,
  }
}

/**
 * Partition items into column buckets by detecting x-gaps wider than
 * `COLUMN_GAP_RATIO × medianHeight` in the global x-distribution of item left
 * edges, then returning each bucket sorted top-to-bottom for per-column line
 * clustering.
 *
 * If no large gap is found, returns a single bucket containing every item.
 */
function partitionIntoColumns(items: TextItem[]): TextItem[][] {
  if (items.length < 2)
    return items.length === 0 ? [] : [items]

  const medianHeight = median(items.map(i => i.height || itemFontSize(i)))
  const threshold = COLUMN_GAP_RATIO * medianHeight

  // Walk items sorted by left edge and find x-gaps between successive item
  // lefts. A gap between item `i` and item `i+1` that exceeds the threshold
  // AND isn't bridged by any item that spans it marks a column boundary.
  const byLeft = [...items].sort((a, b) => itemLeft(a) - itemLeft(b))

  // Sweep-line: track the maximum right edge seen so far. If the next item's
  // left is more than `threshold` beyond the running max-right, that's a
  // column boundary.
  const cuts: number[] = []
  let runningMaxRight = itemRight(byLeft[0]!)
  for (let i = 1; i < byLeft.length; i += 1) {
    const next = byLeft[i]!
    if (itemLeft(next) - runningMaxRight > threshold) {
      cuts.push(itemLeft(next))
    }
    runningMaxRight = Math.max(runningMaxRight, itemRight(next))
  }

  if (cuts.length === 0)
    return [items]

  // Bucket each item into the column whose left-boundary immediately precedes
  // or equals its left edge.
  const boundaries = [Number.NEGATIVE_INFINITY, ...cuts, Number.POSITIVE_INFINITY]
  const buckets: TextItem[][] = Array.from({ length: boundaries.length - 1 }, () => [])
  for (const item of items) {
    const left = itemLeft(item)
    for (let b = 0; b < boundaries.length - 1; b += 1) {
      if (left >= boundaries[b]! && left < boundaries[b + 1]!) {
        buckets[b]!.push(item)
        break
      }
    }
  }
  return buckets.filter(b => b.length > 0)
}

/**
 * Group items into lines by y-center proximity within each column partition.
 *
 * Column partitioning runs first so that same-baseline items in different
 * columns aren't merged into a single oversized "line". Within each column,
 * items are sorted top-to-bottom (higher PDF y first) and clustered by
 * y-proximity using `LINE_Y_TOLERANCE_RATIO × lineHeight`.
 *
 * The returned lines are ordered column-by-column (all lines in column A
 * top-to-bottom, then column B, …). Paragraph-break detection then runs on
 * this flat list; it will naturally fire a break at the column boundary
 * because the x-indent jump or y-reset trips `isParagraphBreak`.
 */
function groupIntoLines(items: TextItem[]): Line[] {
  const nonEmpty = items.filter(item => item.str.length > 0)
  if (nonEmpty.length === 0)
    return []

  const columns = partitionIntoColumns(nonEmpty)
  const allLines: Line[] = []

  for (const column of columns) {
    // Sort top-to-bottom (descending baseline y), then left-to-right.
    const sorted = [...column].sort((a, b) => {
      const byY = itemBaselineY(b) - itemBaselineY(a)
      if (Math.abs(byY) > 0.5)
        return byY
      return itemLeft(a) - itemLeft(b)
    })

    let current: TextItem[] = []
    const flush = () => {
      if (current.length === 0)
        return
      allLines.push(buildLine(current))
      current = []
    }

    for (const item of sorted) {
      if (current.length === 0) {
        current.push(item)
        continue
      }
      const lineHeight = Math.max(
        ...current.map(i => i.height || itemFontSize(i)),
        item.height || itemFontSize(item),
      )
      const currentMean = current.reduce((s, i) => s + itemBaselineY(i), 0) / current.length
      const delta = Math.abs(itemBaselineY(item) - currentMean)
      if (delta <= LINE_Y_TOLERANCE_RATIO * lineHeight) {
        current.push(item)
      }
      else {
        flush()
        current.push(item)
      }
    }
    flush()
  }

  return allLines
}

/**
 * Decide whether `next` starts a new paragraph relative to `prev`.
 *
 * Returns true if ANY of the BabelDOC-inspired break rules fire:
 *  1. font-size change exceeds `FONT_SIZE_CHANGE_RATIO` (heading boundary)
 *  2. vertical gap > `PARAGRAPH_GAP_RATIO × prev.height` (blank line)
 *  3. x-indent jump > `COLUMN_X_JUMP_RATIO × prev.height` (column break)
 *  4. `next` starts with a bullet marker (`BULLET_PATTERN`)
 *  5. `prev` contains a TOC dot leader (`TOC_DOT_LEADER`)
 */
function isParagraphBreak(prev: Line, next: Line): boolean {
  // Rule 1: font-size change.
  const refSize = Math.max(prev.fontSize, next.fontSize)
  if (refSize > 0) {
    const delta = Math.abs(prev.fontSize - next.fontSize) / refSize
    if (delta > FONT_SIZE_CHANGE_RATIO)
      return true
  }

  // Rule 2: vertical gap (PDF y decreases as we move down the page).
  const verticalGap = prev.baselineY - next.baselineY
  const referenceHeight = Math.max(prev.height, next.height)
  if (verticalGap > PARAGRAPH_GAP_RATIO * referenceHeight)
    return true

  // Rule 3: x-indent jump (column break or wildly different layout).
  const xJump = Math.abs(next.left - prev.left)
  if (xJump > COLUMN_X_JUMP_RATIO * referenceHeight)
    return true

  // Rule 4: bullet start.
  if (BULLET_PATTERN.test(next.text))
    return true

  // Rule 5: TOC dot leader on the previous line.
  if (TOC_DOT_LEADER.test(prev.text))
    return true

  return false
}

/**
 * Concatenate line texts into paragraph text with hyphen-continuation handling.
 *
 * - Line-final `[A-Za-z]{2,}-` is dropped and the next line is glued directly.
 * - Otherwise lines are joined with a single space.
 */
function joinLines(lines: Line[]): string {
  if (lines.length === 0)
    return ""
  let out = lines[0]!.text
  for (let i = 1; i < lines.length; i += 1) {
    const hyphenMatch = out.match(HYPHEN_CONTINUATION_RE)
    if (hyphenMatch) {
      // Strip the hyphen and glue.
      out = out.replace(HYPHEN_CONTINUATION_RE, hyphenMatch[1]!) + lines[i]!.text
    }
    else {
      out = `${out} ${lines[i]!.text}`
    }
  }
  return out.replace(/\s+/g, " ").trim()
}

function boundingBoxOf(lines: Line[]): BoundingBox {
  const allItems = lines.flatMap(l => l.items)
  const lefts = allItems.map(itemLeft)
  const rights = allItems.map(itemRight)
  const baselines = allItems.map(itemBaselineY)
  const tops = allItems.map(i => itemBaselineY(i) + (i.height || itemFontSize(i)))
  const x = Math.min(...lefts)
  const right = Math.max(...rights)
  const y = Math.min(...baselines)
  const top = Math.max(...tops)
  return {
    x: round2(x),
    y: round2(y),
    width: round2(right - x),
    height: round2(top - y),
  }
}

// --- public API -----------------------------------------------------------

/**
 * Aggregate pdf.js `TextItem[]` into `Paragraph[]`.
 *
 * Pure function: no browser APIs, no I/O. Safe to run in Node/Vitest.
 *
 * @param items Text items for a single page, typically
 *   `(await page.getTextContent()).items` cast to `TextItem[]`.
 * @param options Aggregation options. `pageIndex` is baked into each
 *   paragraph's stable `key` (`p-${pageIndex}-${paragraphIndex}`).
 */
export function aggregate(
  items: TextItem[],
  options: AggregateOptions = {},
): Paragraph[] {
  const pageIndex = options.pageIndex ?? 0
  const lines = groupIntoLines(items)
  if (lines.length === 0)
    return []

  // Walk lines top-to-bottom, emitting paragraphs on each break.
  const groups: Line[][] = [[lines[0]!]]
  for (let i = 1; i < lines.length; i += 1) {
    const prev = lines[i - 1]!
    const next = lines[i]!
    if (isParagraphBreak(prev, next)) {
      groups.push([next])
    }
    else {
      groups[groups.length - 1]!.push(next)
    }
  }

  return groups.map((groupLines, idx) => {
    const items = groupLines.flatMap(l => l.items)
    const fontSize = round2(Math.max(...groupLines.map(l => l.fontSize)))
    return {
      items,
      text: joinLines(groupLines),
      boundingBox: boundingBoxOf(groupLines),
      fontSize,
      key: `p-${pageIndex}-${idx}`,
    }
  })
}
