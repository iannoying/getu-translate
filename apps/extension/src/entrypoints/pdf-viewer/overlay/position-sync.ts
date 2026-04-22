/**
 * Viewport-aware PDF → CSS px coordinate conversion.
 *
 * Why this exists
 * ---------------
 * Paragraph bounding boxes (`paragraph/aggregate.ts`) and raw `TextItem`
 * transforms are in **PDF user-space units** (points), with PDF's native
 * y-up origin at the page's bottom-left. pdf.js's rendered `.textLayer` /
 * canvas, on the other hand, lives in CSS pixels with the browser's y-down
 * origin at the top-left. Bridging the two requires the current
 * `PageViewport.transform` matrix — a 6-element affine that pdf.js composes
 * from the active scale + rotation + a mandatory y-flip.
 *
 * The matrix semantics (see `pdfjs-dist/types/src/display/display_utils.d.ts`
 * on `PageViewport.transform`) are:
 *
 * ```
 * x_css = a * x_pdf + c * y_pdf + e
 * y_css = b * x_pdf + d * y_pdf + f
 * ```
 *
 * where `transform = [a, b, c, d, e, f]`. At scale=1, rotation=0 a typical
 * default is `[1, 0, 0, -1, 0, H_pdf]`, which flips y and translates so the
 * PDF's bottom edge lands at CSS y=H_css.
 *
 * Bounding-box projection
 * -----------------------
 * Under non-zero rotation the viewport transform can map an axis-aligned PDF
 * rect to a non-axis-aligned CSS quad. Rather than special-casing rotation
 * we always project all four corners and take the axis-aligned bounding
 * rectangle (min/max over x and y). Under the common scale+y-flip case this
 * collapses back to the same answer as projecting two opposite corners;
 * under 90° / 270° rotation it's a small overapproximation that's still
 * visually correct for slot placement.
 *
 * Purity
 * ------
 * All exports are pure functions of `{viewport.transform}` + numeric inputs.
 * They do not touch the DOM and do not depend on `pdfjs-dist` types, which
 * keeps them trivially unit-testable with hand-crafted matrices.
 */

/** Minimal structural subset of `pdfjs-dist`'s `PageViewport` needed here. */
export interface ViewportLike {
  /**
   * 6-element PDF→CSS-px affine `[a, b, c, d, e, f]`, per
   * `PageViewport.transform`. Applied as
   * `x_css = a*x + c*y + e`, `y_css = b*x + d*y + f`.
   */
  transform: [number, number, number, number, number, number]
}

/**
 * Project a single `(x_pdf, y_pdf)` point into CSS pixels via the viewport
 * transform. Exported primarily for unit tests; most callers want
 * `projectBoundingBoxToCss` below.
 */
export function projectPointToCss(
  xPdf: number,
  yPdf: number,
  viewport: ViewportLike,
): { x: number, y: number } {
  const [a, b, c, d, e, f] = viewport.transform
  return {
    x: a * xPdf + c * yPdf + e,
    y: b * xPdf + d * yPdf + f,
  }
}

/**
 * Project a PDF-unit bounding box into a CSS-pixel axis-aligned box.
 *
 * All four corners are transformed and reduced via min/max so the result is
 * correct under rotation as well as the common scale+y-flip case.
 */
export function projectBoundingBoxToCss(
  box: { x: number, y: number, width: number, height: number },
  viewport: ViewportLike,
): { x: number, y: number, width: number, height: number } {
  const corners = [
    projectPointToCss(box.x, box.y, viewport),
    projectPointToCss(box.x + box.width, box.y, viewport),
    projectPointToCss(box.x, box.y + box.height, viewport),
    projectPointToCss(box.x + box.width, box.y + box.height, viewport),
  ]
  let minX = corners[0]!.x
  let maxX = corners[0]!.x
  let minY = corners[0]!.y
  let maxY = corners[0]!.y
  for (let i = 1; i < corners.length; i++) {
    const { x, y } = corners[i]!
    if (x < minX)
      minX = x
    if (x > maxX)
      maxX = x
    if (y < minY)
      minY = y
    if (y > maxY)
      maxY = y
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
