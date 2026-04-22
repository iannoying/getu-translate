# BabelDOC paragraph-detection port — investigation notes

**Target plan:** `docs/plans/2026-04-21-m3-pdf-translate-pr-b1.md` Task 1.
**Date:** 2026-04-21.
**Decision:** BabelDOC-inspired self-written heuristic (NOT a verbatim port).

## Reference sources consulted

Clone: `git clone https://github.com/funstory-ai/BabelDOC --depth 1`.

| File                                                         | Role                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `babeldoc/format/pdf/document_il/midend/paragraph_finder.py` | Entry point. `ParagraphFinder.process_page` drives the whole pipeline: group chars → paragraphs, split paragraphs → lines, process spacing, split independent paragraphs, merge alternating line-numbers, fix overlaps. |
| `babeldoc/format/pdf/document_il/utils/paragraph_helper.py`  | Post-hoc paragraph classifiers: `is_cid_paragraph`, `is_pure_numeric_paragraph`, `is_placeholder_only_paragraph`.                                                                                                       |
| `babeldoc/format/pdf/document_il/utils/layout_helper.py`     | `is_bullet_point`, `is_text_layout`, `get_character_layout`, regex constants.                                                                                                                                           |
| `babeldoc/docvision/doclayout.py`                            | YOLO layout model loader. **Not portable** to the browser.                                                                                                                                                              |

## Input data shape

**BabelDOC.** Character-level: `PdfCharacter` (one glyph per item) with a
`visual_bbox.box` (x, y, x2, y2), `char_unicode`, `xobj_id`, `formula_layout_id`
set from pdfminer + the YOLO layout model.

**pdf.js.** Run-level: `TextItem` (typically one per visual line, sometimes
per word) with `str`, `transform[6]` (PDF affine matrix `[sx, kx, ky, sy, tx, ty]`),
`width`, `height`, `fontName`.

This granularity difference is the single biggest reason we cannot verbatim
port: BabelDOC needs character-level data to run its line-threading histogram,
while pdf.js already gives us line-ish units.

## Why a verbatim port is impractical

1. **YOLO layout dependency.** `_group_characters_into_paragraphs` uses
   `build_layout_index` (output of a YOLO-based doc-layout model) to decide
   paragraph boundaries by layout-id. No such oracle exists in the browser,
   and shipping one would inflate the MV3 bundle by orders of magnitude.
2. **NumPy line-threading.** `_split_paragraph_into_lines` builds a collision
   histogram with `np.add.at` + `np.cumsum`. pdf.js emits lines pre-clustered,
   so we don't need this — simple y-center grouping suffices.
3. **pdfminer IL tree.** BabelDOC threads data through `PdfParagraph` /
   `PdfParagraphComposition` / `PdfLine` / `PdfCharacter` objects — a big
   surface area with no benefit if we start from `TextItem`.
4. **xobject / formula-layout grouping.** pdf.js does not expose xobject IDs
   in its public text-content API, so `paragraph_finder.py`'s xobject-change
   break rule has no analogue.

## Rules ported (adapted)

| BabelDOC rule                                                                      | This port                                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Line clustering by y-proximity (mid-line distance < char height)                   | Adopted — `LINE_Y_TOLERANCE_RATIO` of `max(lineHeight, itemHeight)`.                            |
| Paragraph break on vertical gap > line height                                      | Adopted — `PARAGRAPH_GAP_RATIO = 1.5 × lineHeight`.                                             |
| Paragraph break on bullet start (`is_bullet_point`)                                | Adopted — `BULLET_PATTERN` regex covers `\u2022`, `\u25E6`, `-`, `*`, `•`, numbered `1.`, `a)`. |
| `process_independent_paragraphs` — split on TOC dot leaders (20+ consecutive dots) | Adopted — `TOC_DOT_LEADER = /\.{20,}/`.                                                         |
| Font size change → heading boundary                                                | Adopted — `FONT_SIZE_CHANGE_RATIO = 0.15`.                                                      |
| Hyphen continuation (`"under-\nstanding"` → `"understanding"`)                     | Adopted — `HYPHEN_CONTINUATION_RE`.                                                             |
| Layout-id change → paragraph break                                                 | Replaced with **x-indent jump** proxy (`COLUMN_X_JUMP_RATIO × lineHeight`).                     |

## Rules dropped (deferred)

| BabelDOC rule                                                        | Why dropped for PR #B1                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| YOLO layout preprocessing (`_preprocess_formula_layouts`)            | No layout oracle in browser.                                                                                                                      |
| `merge_alternating_line_number_paragraphs` (A-L-A merge)             | Requires layout-aware line-number detection; deferred.                                                                                            |
| `fix_overlapping_paragraphs` (midpoint box adjustment)               | pdf.js textLayer does not produce overlapping spans in typical PDFs.                                                                              |
| `is_cid_paragraph` / `check_cid_paragraph` (CID error gate)          | Diagnostic-only for translation stage; not needed at overlay time.                                                                                |
| `calculate_iou_for_boxes` + `is_bbox_contain_in_vertical`            | Used by the overlap fixer above; also deferred.                                                                                                   |
| Character-level collision histogram line splitter                    | pdf.js already emits at line granularity.                                                                                                         |
| `SHORT_LINE_SPLIT_FACTOR` (split when prev line width < 0.5× median) | Dropped for PR #B1 — deferred; needs median-width computation; mostly affects last-line detection which is orthogonal to the B1 scaffolding goal. |

## Known limitations flagged in `aggregate.ts`

- **Double-column detection is geometric only.** Adjacent columns with similar
  font size and small gaps between their rightmost-column and leftmost-column
  items may misgroup.
- **No table handling.** Tables become many small paragraphs — acceptable for
  the "translate paragraphs" use-case because we don't translate cells.
- **No inline formula detection.** Math runs through the regular path.
- **`transform[3]` sign assumption.** We take the absolute value as a guard;
  documented inline.

## Fallback plan if the heuristic misfires at runtime

If the 5 fixture tests fail to cover real-world misgrouping, the next
iteration (PR #B2 / B3) can:

- Add BabelDOC's `calculate_median_line_width` + short-line split factor
  (PARAGRAPH_FINDER `process_independent_paragraphs`) — keeps the port
  incremental.
- Add `merge_alternating_line_number_paragraphs` once line-number detection is
  cheap (simple regex heuristic suffices for journal articles).
