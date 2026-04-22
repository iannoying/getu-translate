import type { ViewportLike } from "../position-sync"
import { describe, expect, it } from "vitest"
import { projectBoundingBoxToCss, projectPointToCss } from "../position-sync"

describe("projectPointToCss", () => {
  it("returns the point unchanged under the identity viewport", () => {
    const viewport: ViewportLike = { transform: [1, 0, 0, 1, 0, 0] }
    expect(projectPointToCss(0, 0, viewport)).toEqual({ x: 0, y: 0 })
    expect(projectPointToCss(50, 120, viewport)).toEqual({ x: 50, y: 120 })
  })

  it("applies y-flip + translation correctly (US Letter @ scale=1)", () => {
    // transform = [1, 0, 0, -1, 0, 792] is pdf.js's default for an 8.5"x11"
    // page at scale=1, rotation=0: x unchanged, y flipped about y=H_pdf/2,
    // origin translated from PDF bottom-left to CSS top-left.
    const viewport: ViewportLike = { transform: [1, 0, 0, -1, 0, 792] }
    // A PDF point near the bottom (small y) becomes near the top of CSS (large y).
    expect(projectPointToCss(0, 0, viewport)).toEqual({ x: 0, y: 792 })
    expect(projectPointToCss(100, 100, viewport)).toEqual({ x: 100, y: 692 })
  })
})

describe("projectBoundingBoxToCss", () => {
  it("returns the box unchanged under the identity viewport", () => {
    const viewport: ViewportLike = { transform: [1, 0, 0, 1, 0, 0] }
    const box = { x: 10, y: 20, width: 300, height: 50 }
    expect(projectBoundingBoxToCss(box, viewport)).toEqual(box)
  })

  it("flips a bottom-anchored PDF box to a top-anchored CSS box", () => {
    // US Letter @ scale=1, y-flip about 792.
    const viewport: ViewportLike = { transform: [1, 0, 0, -1, 0, 792] }
    // Paragraph near the bottom of the PDF page: PDF y=100, height=40.
    // In PDF space the box spans y ∈ [100, 140]. After flip + translate:
    //   y_css_top    = 792 - 140 = 652  (top of CSS box == bottom of PDF box after flip)
    //   y_css_bottom = 792 - 100 = 692
    // So the CSS-space box has y=652, height=40, x/width unchanged.
    const box = { x: 50, y: 100, width: 200, height: 40 }
    expect(projectBoundingBoxToCss(box, viewport)).toEqual({
      x: 50,
      y: 652,
      width: 200,
      height: 40,
    })
  })

  it("doubles width/height under a 2x scale viewport (with y-flip)", () => {
    // scale=2, y-flip about 792*2=1584.
    const viewport: ViewportLike = { transform: [2, 0, 0, -2, 0, 1584] }
    const box = { x: 50, y: 100, width: 200, height: 40 }
    const projected = projectBoundingBoxToCss(box, viewport)
    expect(projected.width).toBe(400) // 200 * 2
    expect(projected.height).toBe(80) // 40 * 2
    // x_css = 50 * 2 = 100
    expect(projected.x).toBe(100)
    // box spans PDF y ∈ [100, 140]; under y-flip * 2 translated by 1584:
    //   y_css_top    = 1584 - 140*2 = 1304
    //   y_css_bottom = 1584 - 100*2 = 1384
    expect(projected.y).toBe(1304)
  })

  it("handles 90° rotation by returning the covering axis-aligned box", () => {
    // 90° CW at scale=1 for an 8.5"x11" page has transform ≈ [0, 1, 1, 0, 0, 0]
    // (no y-flip; swaps x/y). We use this synthetic matrix as a pure rotation
    // to validate that all 4 corners are projected, not just 2.
    const viewport: ViewportLike = { transform: [0, 1, 1, 0, 0, 0] }
    const box = { x: 10, y: 20, width: 100, height: 30 }
    // Corners: (10,20) → (20,10); (110,20) → (20,110); (10,50) → (50,10); (110,50) → (50,110).
    // min/max: x ∈ [20,50], y ∈ [10,110].
    expect(projectBoundingBoxToCss(box, viewport)).toEqual({
      x: 20,
      y: 10,
      width: 30,
      height: 100,
    })
  })
})
