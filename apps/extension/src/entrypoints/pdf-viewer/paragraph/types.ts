/**
 * Paragraph detection input/output types.
 *
 * Kept independent of `pdfjs-dist` so unit tests (and any headless consumer)
 * can construct inputs by hand without pulling in the viewer / worker bundle.
 * The `TextItem` shape intentionally mirrors the public fields of
 * `pdfjs-dist`'s `TextItem` (see `pdfjs-dist/types/src/display/api.d.ts`),
 * so an array produced by `PDFPageProxy.getTextContent().items` is assignable
 * to `TextItem[]` here with only a structural cast.
 *
 * Coordinate convention
 * ---------------------
 * `transform` is the 6-element PDF affine matrix emitted by pdf.js for each
 * text run: `[sx, kx, ky, sy, tx, ty]`. `tx, ty` is the glyph origin in PDF
 * user-space units (points); `sx, sy` encode the effective font size (sy is
 * typically positive because pdf.js already flips the y-axis for us when
 * constructing the item — unlike raw PDF content streams). `width, height`
 * are in PDF units.
 *
 * `Paragraph.boundingBox` is expressed in the same (PDF) coordinate space.
 * Projection to CSS pixels is a separate concern (handled later by
 * `overlay/position-sync.ts` in Task 4) so `aggregate()` can stay a pure
 * function of the item stream.
 */

export interface TextItem {
  /** Raw glyph string for this text run. May contain a single character or a whole line. */
  str: string
  /** PDF affine matrix `[sx, kx, ky, sy, tx, ty]`. `tx/ty` is the glyph origin. */
  transform: [number, number, number, number, number, number]
  /** Run width in PDF units. */
  width: number
  /** Run height in PDF units (typically the font ascent+descent). */
  height: number
  /** Font identifier as reported by pdf.js (e.g. `"g_d0_f1"`). */
  fontName: string
  /**
   * Optional: pdf.js emits a dedicated `EOL` hint item when the content stream
   * explicitly breaks the line. We tolerate but do not require it.
   */
  hasEOL?: boolean
}

export interface BoundingBox {
  /** Left edge in PDF units. */
  x: number
  /** Bottom edge in PDF units (y grows upward in PDF space after pdf.js normalisation). */
  y: number
  /** Width in PDF units. */
  width: number
  /** Height in PDF units. */
  height: number
}

export interface Paragraph {
  /** Items in reading order (top-to-bottom, left-to-right). */
  items: TextItem[]
  /**
   * Concatenated paragraph text.
   *
   * Line breaks are collapsed to a single space, except when the previous line
   * ends in a hyphen (`-`) followed by whitespace, in which case the hyphen is
   * removed and the next line's first word is glued directly (handles PDF line
   * hyphenation e.g. `"under-\nstanding"` → `"understanding"`).
   */
  text: string
  /** Bounding box in PDF units covering every item in the paragraph. */
  boundingBox: BoundingBox
  /** Dominant font size in PDF units (max of `transform[3]` over all items, rounded to 2dp). */
  fontSize: number
  /**
   * Stable key suitable for atom indexing and DOM `data-*` attributes.
   * Format: `p-${pageIndex}-${paragraphIndex}`.
   */
  key: string
}

/**
 * Options accepted by `aggregate()`. All fields are optional; defaults are
 * tuned for typical academic-paper layouts and documented at the call site.
 */
export interface AggregateOptions {
  /** Zero-based page index, baked into each paragraph's `key`. Defaults to `0`. */
  pageIndex?: number
}
