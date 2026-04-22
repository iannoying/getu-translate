import type { Paragraph } from "../paragraph/types"
/**
 * Per-page overlay layer. Absolutely positioned sibling of pdf.js `.textLayer`,
 * renders one `<Slot/>` per paragraph.
 *
 * The layer is a pass-through container: it takes already-computed
 * `Paragraph[]` (from `paragraph/aggregate.ts`) plus a `pageScale` factor and
 * positions each slot below its paragraph's bounding box in CSS pixels.
 *
 * Coordinate conversion (PR #B1)
 * ------------------------------
 * `Paragraph.boundingBox` is in **PDF units** (points). The simplest
 * conversion that works at the current viewport scale is a uniform multiply
 * by `pageScale` (which callers pass from `PDFPageView.viewport.scale`). This
 * is a deliberate simplification — it ignores the PDF-to-CSS y-axis flip and
 * any rotation. The flip matters: PDF y grows upward from the bottom-left,
 * while CSS y grows downward from the top-left. For PR #B1's "show
 * placeholders somewhere reasonable" goal this is acceptable; slots will
 * appear mirrored vertically relative to their paragraph. Task 4 will
 * replace this with a proper `PageViewport.convertToViewportPoint()` call.
 *
 * TODO(B1-Task4): replace the naive `pageScale` multiply with the full
 * viewport transform from `PDFPageView.viewport` (handles y-flip and
 * rotation). See `docs/plans/2026-04-21-m3-pdf-translate-pr-b1.md` § Task 4.
 */
import * as React from "react"
import { Slot } from "./slot"

export interface OverlayLayerProps {
  /** Detected paragraphs for the page (PDF-unit bounding boxes). */
  paragraphs: Paragraph[]
  /** Zero-based page index. Echoed into `data-page-index` on the wrapper. */
  pageIndex: number
  /**
   * PDF→CSS px multiplier, typically `PDFPageView.viewport.scale`. Defaults
   * to `1` so the component is trivially usable in tests / headless mode.
   */
  pageScale?: number
  /**
   * Minimum slot height in CSS pixels. Passed through to every `<Slot/>`.
   * Defaults to 24 — enough to display the `[...]` placeholder legibly.
   */
  minSlotHeight?: number
}

/**
 * Compute a CSS-pixel placement for a slot anchored *below* the paragraph.
 *
 * Exported for unit testing; callers should prefer `<OverlayLayer/>`.
 */
export function computeSlotPosition(
  paragraph: Paragraph,
  pageScale: number,
): { left: number, top: number, width: number } {
  const { x, y, width, height } = paragraph.boundingBox
  // TODO(B1-Task4): this linear scale is a placeholder. The PDF coordinate
  // system has y growing upward from the page bottom; CSS has y growing
  // downward from the page top. Task 4 will apply the full viewport
  // transform (y-flip + any rotation) so slots sit precisely below the
  // paragraph in screen space.
  return {
    left: x * pageScale,
    top: (y + height) * pageScale,
    width: width * pageScale,
  }
}

/**
 * Overlay layer root. One React root per page container.
 *
 * Re-renders on every pdf.js `textlayerrendered` (zoom / page re-layout):
 * callers invoke `root.render(<OverlayLayer ... />)` again with fresh
 * `paragraphs` and `pageScale`.
 */
export function OverlayLayer({
  paragraphs,
  pageIndex,
  pageScale = 1,
  minSlotHeight,
}: OverlayLayerProps) {
  return (
    <div
      className="getu-overlay-inner"
      data-page-index={pageIndex}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {paragraphs.map(paragraph => (
        <Slot
          key={paragraph.key}
          paragraph={paragraph}
          position={computeSlotPosition(paragraph, pageScale)}
          minHeight={minSlotHeight}
        />
      ))}
    </div>
  )
}
