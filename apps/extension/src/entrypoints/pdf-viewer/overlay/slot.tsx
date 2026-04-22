import type { Paragraph } from "../paragraph/types"
/**
 * Single overlay slot — a positioned placeholder rendered below one paragraph.
 *
 * PR #B1 scaffolding: content is the literal string `[...]`. PR #B2 will swap
 * the content for translation text, possibly via a render-prop / children.
 *
 * Positioning contract
 * --------------------
 * Slots are positioned absolutely inside their parent `.getu-overlay`, which
 * is itself absolutely positioned to cover the pdf.js page container. Top/Left
 * are given in CSS pixels (see `overlay/layer.tsx` for the conversion from
 * paragraph bounding boxes, which live in PDF units for PR #B1).
 *
 * Pointer events are disabled so the original textLayer underneath remains
 * selectable. When the slot gains real content in PR #B2+, individual
 * interactive elements inside it can re-enable pointer-events locally.
 */
import * as React from "react"

export interface SlotProps {
  /** The paragraph this slot is anchored to. Only `key` + `boundingBox` are used today. */
  paragraph: Paragraph
  /** CSS-pixel offset from the overlay's top-left, in which to position this slot. */
  position: {
    /** Left edge in CSS px. */
    left: number
    /** Top edge in CSS px (typically paragraph bottom — slot sits *below* the paragraph). */
    top: number
    /** Width in CSS px. */
    width: number
  }
  /** Minimum vertical space reserved for this slot (CSS px). Defaults to 24px. */
  minHeight?: number
}

const DEFAULT_MIN_HEIGHT_PX = 24

/**
 * A single overlay slot. Renders a placeholder `[...]` glyph for PR #B1.
 *
 * The `data-segment-key` attribute is the hook PR #B2 will use to address
 * slots by paragraph key when writing translation text back via atoms /
 * mutation observers.
 */
export function Slot({ paragraph, position, minHeight = DEFAULT_MIN_HEIGHT_PX }: SlotProps) {
  return (
    <div
      className="getu-slot"
      data-segment-key={paragraph.key}
      style={{
        position: "absolute",
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        minHeight: `${minHeight}px`,
        // Matched to the overlay layer's pointer-events: none; re-enabled by
        // interactive children in B2+.
        pointerEvents: "none",
      }}
    >
      [...]
    </div>
  )
}
