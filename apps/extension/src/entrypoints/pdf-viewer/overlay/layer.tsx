import type { Paragraph } from "../paragraph/types"
import type { ViewportLike } from "./position-sync"
/**
 * Per-page overlay layer. Absolutely positioned sibling of pdf.js `.textLayer`,
 * renders one `<Slot/>` per paragraph.
 *
 * The layer is a pass-through container: it takes already-computed
 * `Paragraph[]` (from `paragraph/aggregate.ts`) plus a `viewport` (the
 * active `PDFPageView.viewport`) and positions each slot below its
 * paragraph's bounding box in CSS pixels.
 *
 * Coordinate conversion (PR #B1)
 * ------------------------------
 * `Paragraph.boundingBox` is in **PDF units** with PDF's y-up convention.
 * `overlay/position-sync.ts` applies the current viewport's 6-element
 * `transform` matrix to project to CSS pixels (handles scale + y-flip +
 * rotation). See that file for the matrix semantics.
 */
import * as React from "react"
import { projectBoundingBoxToCss } from "./position-sync"
import { Slot } from "./slot"

export interface OverlayLayerProps {
  /** Detected paragraphs for the page (PDF-unit bounding boxes). */
  paragraphs: Paragraph[]
  /** Zero-based page index. Echoed into `data-page-index` on the wrapper. */
  pageIndex: number
  /**
   * Active `PDFPageView.viewport` (or any object exposing the 6-element
   * PDF→CSS transform). Required — callers must pass either the live
   * pdf.js viewport or, for headless tests that author coordinates
   * directly in CSS px, the exported `IDENTITY_VIEWPORT`.
   */
  viewport: ViewportLike
  /**
   * Minimum slot height in CSS pixels. Passed through to every `<Slot/>`.
   * Defaults to 24 — enough to display the `[...]` placeholder legibly.
   */
  minSlotHeight?: number
}

/**
 * Identity viewport: no-op transform. Exported so headless tests (and any
 * other non-pdf.js caller that already has CSS-px coordinates) can pass
 * it explicitly instead of constructing a fake viewport inline.
 */
export const IDENTITY_VIEWPORT: ViewportLike = { transform: [1, 0, 0, 1, 0, 0] }

/**
 * Compute a CSS-pixel placement for a slot anchored *below* the paragraph.
 *
 * The paragraph's bounding box is projected into CSS px via the viewport
 * transform (`projectBoundingBoxToCss`), then the slot is anchored to the
 * projected box's bottom edge. Exported for unit testing; callers should
 * prefer `<OverlayLayer/>`.
 */
export function computeSlotPosition(
  paragraph: Paragraph,
  viewport: ViewportLike,
): { left: number, top: number, width: number } {
  const css = projectBoundingBoxToCss(paragraph.boundingBox, viewport)
  return {
    left: css.x,
    top: css.y + css.height,
    width: css.width,
  }
}

/**
 * Overlay layer root. One React root per page container.
 *
 * Re-renders on every pdf.js `textlayerrendered` (zoom / page re-layout):
 * callers invoke `root.render(<OverlayLayer ... />)` again with a fresh
 * `viewport` so the slots track pdf.js's rendered text layer pixel-for-pixel.
 */
export function OverlayLayer({
  paragraphs,
  pageIndex,
  viewport,
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
          position={computeSlotPosition(paragraph, viewport)}
          minHeight={minSlotHeight}
        />
      ))}
    </div>
  )
}
