import type { Paragraph } from "../paragraph/types"

/**
 * Default minimum slot height in CSS pixels.
 *
 * Sized to comfortably host the PR #B1 `[...]` placeholder with a bit of
 * breathing room. PR #B2 replaces placeholders with real translation text,
 * at which point `computePageExtension` will be refined to measure each
 * slot's post-render height rather than assuming this linear-model default.
 */
export const DEFAULT_MIN_SLOT_HEIGHT_PX = 24

/**
 * Compute the vertical space (in CSS px) to reserve below a pdf.js `.page`
 * container so every overlay slot anchored to that page has room to render
 * without clipping into the next page.
 *
 * PR #B1 scaffolding: we don't yet know the real height each translation
 * block will occupy, so we reserve a conservative `minSlotHeight` per
 * paragraph. Applied as `paddingBottom` on the page container; pdf.js
 * scroll logic uses `getBoundingClientRect()` which honours padding, so
 * page navigation, page-number indicators, and the scroll bar all update
 * correctly without touching pdf.js internals.
 *
 * PR #B2 will replace this linear model with per-slot measured heights
 * (after translation text renders, via a ResizeObserver) so the padding
 * tracks the real content height and no layout slack is wasted.
 *
 * Pure — no DOM access. Safe to unit-test without jsdom.
 */
export function computePageExtension(
  paragraphs: Paragraph[],
  minSlotHeight: number,
): number {
  return paragraphs.length * minSlotHeight
}
