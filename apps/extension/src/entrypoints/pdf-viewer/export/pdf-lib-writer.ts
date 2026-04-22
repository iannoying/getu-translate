/**
 * Bilingual PDF exporter (M3 PR#C Task 2, Pro tier; inline export in
 * follow-up Task 3).
 *
 * Given an original PDF URL + the keys into the Dexie `pdfTranslations`
 * cache, re-writes the PDF with translated paragraphs drawn either
 * **directly below** each source paragraph (when bounding-box metadata
 * is available on every paragraph of a page) or, for legacy cache rows
 * that predate the bbox capture, as a footer block at the bottom of the
 * page.
 *
 * # Scope of this module
 *
 * Pure export pipeline: fetch → load → walk pages → draw → serialize.
 * Wiring it to a UI button (loading states, download trigger, entitlement
 * gating) lives in M3 PR#C Task 3, and the CJK font asset drop-in is a
 * one-time ops step documented in
 * `apps/extension/public/assets/fonts/README.md`.
 *
 * # Layout decision
 *
 * For each page we look at its cached paragraphs:
 *   - If **every** paragraph has a `boundingBox`, we draw the translation
 *     directly under the source paragraph at `(bbox.x, bbox.y - …)` in
 *     PDF coords, wrapping to `bbox.width`. This is the "inline" layout
 *     and produces a proper bilingual reading flow.
 *   - If **any** paragraph lacks `boundingBox` (legacy v8 cache rows
 *     written before M3 follow-up Task 2), we fall back to the footer
 *     layout for the entire page. Per-page decision avoids mixed layouts
 *     within a single page and keeps the test matrix small.
 *
 * Users who exported a PDF and want to re-export with inline placement
 * can clear the cache (Options → "Clear cache") and re-translate.
 *
 * # Coordinate system
 *
 * pdf-lib uses PDF native coordinates: `(0, 0)` is the bottom-left corner
 * of the page and y grows **upward**. `pdfjs-dist` (used at extract time)
 * already normalises text items into this space, so the `BoundingBox`
 * values stored in the cache map directly to pdf-lib's `drawText` inputs
 * with no axis flip. When we draw a translation "below" a source
 * paragraph, that means **subtracting** from `bbox.y` because smaller y
 * is lower on the page.
 *
 * # Font strategy
 *
 * - If **any** cached paragraph on **any** page contains a CJK code point
 *   (per `containsCJK`), we fetch the subsetted Noto Sans CJK SC font from
 *   the extension bundle once and embed it with `{ subset: true }`. The
 *   subset bytes end up ≤ ~400 KB so the output PDF stays reasonably
 *   small.
 * - Otherwise we fall back to the standard Helvetica font, which pdf-lib
 *   embeds without fontkit and without any extra fetch.
 *
 * Both fonts are lazily embedded — a Latin-only doc never pays the CJK
 * fetch/embed cost, and vice-versa.
 */

import type { PDFFont, PDFPage } from "pdf-lib"
import type { PdfTranslationParagraph } from "@/utils/db/dexie/pdf-translations"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { getCachedPage } from "@/utils/db/dexie/pdf-translations"
import { containsCJK } from "@/utils/pdf/cjk"
import { getCjkFontUrl } from "@/utils/pdf/font-path"

/**
 * Caller-supplied inputs for {@link exportBilingualPdf}.
 *
 * All four fields are needed to look up cached page translations — the
 * Dexie cache key is `(fileHash, pageIndex, targetLang, providerId)` so
 * switching any of the last three yields a cache miss (the writer will
 * leave such pages untouched).
 */
export interface ExportOptions {
  /** URL to fetch the original PDF bytes from (typically the viewer `?src=`). */
  src: string
  /** Content-addressed fingerprint of the PDF, matches the Dexie cache rows. */
  fileHash: string
  /** Target language the user translated into (e.g. `"zh-CN"`). */
  targetLang: string
  /** Provider id (e.g. `"openai"`) used for the cached translation. */
  providerId: string
}

/**
 * Footer layout constants (legacy fallback). Kept module-private so tests
 * can assert behavior without coupling to specific pixel offsets.
 */
const FOOTER = {
  /** Font size (pt) of translated paragraph lines in the footer block. */
  FONT_SIZE: 9,
  /** Line height multiplier relative to font size. */
  LINE_HEIGHT: 1.3,
  /** Left / right / bottom margin (pt) reserved for the footer block. */
  MARGIN: 36,
  /** Gap (pt) between paragraphs inside the footer. */
  PARAGRAPH_GAP: 4,
  /**
   * Maximum wrapped lines reserved for the footer block. Translations that
   * overflow this budget are silently clipped (documented limitation — a
   * later iteration can split across appended pages or shrink the font).
   */
  MAX_LINES: 12,
} as const

/**
 * Inline layout constants used when every paragraph on a page has a
 * bounding box. Tuned so the translation reads as a secondary line
 * directly below the source paragraph without fighting the original
 * typography.
 */
const INLINE = {
  /**
   * Font size (pt) of inline translations. Slightly smaller than the
   *  typical 10-11pt body of an academic paper so the translation reads
   *  as a secondary layer.
   */
  FONT_SIZE: 9,
  /** Line height multiplier relative to font size. */
  LINE_HEIGHT: 1.2,
  /**
   * Vertical padding (pt) between the source paragraph's bottom edge and
   * the first line of the translation. Keeps the two from visually
   * colliding while staying tight enough to read as associated.
   */
  TOP_PADDING: 2,
  /** Horizontal padding (pt) applied to `bbox.width` before wrapping. */
  SIDE_PADDING: 0,
} as const

/**
 * Export the original PDF at `options.src` enriched with the cached
 * translations for each page.
 *
 * The returned Blob has MIME `application/pdf`, ready for
 * `URL.createObjectURL()` + anchor download in the UI layer (Task 3).
 *
 * Behavior:
 *   - Fetches `options.src` with `credentials: "omit"` to avoid leaking
 *     cookies to arbitrary PDF hosts; throws on network failure or non-OK
 *     HTTP status so the caller can surface a user-visible error.
 *   - Loads the bytes into `pdf-lib`. If a page has no cached translations
 *     (cache miss or config mismatch), it's left untouched in the output.
 *   - Picks per-page layout: inline when every paragraph has a bbox,
 *     footer otherwise.
 *   - Embeds at most one Latin font and at most one CJK font per export,
 *     both lazily.
 *
 * @throws {Error} when the fetch fails or returns a non-OK status.
 */
export async function exportBilingualPdf(options: ExportOptions): Promise<Blob> {
  // 1. Fetch the original PDF bytes. Credentials-omit mirrors the
  // fingerprint fetch (PR #A hardening) so we never send cookies to a PDF
  // host that might not expect them.
  const res = await fetch(options.src, { credentials: "omit" })
  if (!res.ok) {
    throw new Error(`exportBilingualPdf: fetch failed (HTTP ${res.status})`)
  }
  const originalBytes = await res.arrayBuffer()

  // 2. Load into pdf-lib and register fontkit. `registerFontkit` is
  // required before `embedFont` with a non-standard (i.e. CJK) font; it's
  // a no-op for standard fonts but harmless to call unconditionally.
  const pdfDoc = await PDFDocument.load(originalBytes)
  pdfDoc.registerFontkit(fontkit)

  // 3. Lazy font embedders. Each closure captures `pdfDoc` and memoizes
  // the embedded font so the corresponding font is paid for at most once
  // per export.
  let cjkFont: PDFFont | null = null
  let latinFont: PDFFont | null = null

  const embedCjkFont = async (): Promise<PDFFont> => {
    if (cjkFont)
      return cjkFont
    const fontUrl = getCjkFontUrl()
    const fontRes = await fetch(fontUrl)
    if (!fontRes.ok) {
      throw new Error(
        `exportBilingualPdf: CJK font fetch failed (HTTP ${fontRes.status})`,
      )
    }
    const fontBytes = await fontRes.arrayBuffer()
    cjkFont = await pdfDoc.embedFont(fontBytes, { subset: true })
    return cjkFont
  }

  const embedLatinFont = async (): Promise<PDFFont> => {
    if (latinFont)
      return latinFont
    latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    return latinFont
  }

  // 4. Walk every page and draw any cached translations. A cache miss (or
  // config-mismatch miss) leaves the page untouched — we silently skip
  // rather than throw so partial translations still export.
  const pages = pdfDoc.getPages()
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]
    if (!page)
      continue

    const cached = await getCachedPage(
      options.fileHash,
      pageIndex,
      options.targetLang,
      options.providerId,
    )
    if (!cached || cached.paragraphs.length === 0)
      continue

    // Decide which font to use for this page based on whether any
    // paragraph contains CJK. We embed eagerly here (not per-paragraph) so
    // a mixed-script page draws with a consistent font.
    const pageHasCjk = cached.paragraphs.some(p => containsCJK(p.translation))
    const font = pageHasCjk ? await embedCjkFont() : await embedLatinFont()

    // Inline layout requires bbox on *every* paragraph on the page. If
    // any is missing we fall back to the legacy footer layout for the
    // whole page — mixing layouts within one page would look chaotic and
    // complicates the visual result.
    if (allHaveBoundingBox(cached.paragraphs)) {
      drawInlineTranslations(page, cached.paragraphs, font)
    }
    else {
      drawFooterTranslations(
        page,
        cached.paragraphs.map(p => p.translation),
        font,
      )
    }
  }

  // 5. Serialize to a Blob. `Uint8Array` → Blob cast is safe: pdf-lib's
  // `save()` returns a fresh buffer we can hand directly to the Blob
  // constructor.
  const outBytes = await pdfDoc.save()
  return new Blob([outBytes as BlobPart], { type: "application/pdf" })
}

/**
 * Type guard: returns true when **every** paragraph in the array has a
 * `boundingBox`. A page only switches to inline layout when this holds;
 * a single missing bbox forces the entire page to the footer fallback.
 */
function allHaveBoundingBox(
  paragraphs: readonly PdfTranslationParagraph[],
): paragraphs is ReadonlyArray<Required<Pick<PdfTranslationParagraph, "boundingBox">> & PdfTranslationParagraph> {
  return paragraphs.every(p => p.boundingBox !== undefined)
}

/**
 * Draw each paragraph's translation directly under the source paragraph
 * using its captured bounding box.
 *
 * Coordinates
 * -----------
 * - `bbox.x` is the left edge of the source paragraph in PDF units.
 * - `bbox.y` is the **bottom** edge of the source paragraph (pdf.js
 *   normalises y-up at extraction time; see `paragraph/types.ts`). The
 *   first translation line sits just below that edge, at
 *   `bbox.y - INLINE.TOP_PADDING - INLINE.FONT_SIZE`. We subtract
 *   `FONT_SIZE` because pdf-lib's `drawText` places the baseline at the
 *   supplied `y`, and we want the glyph ascenders to live inside the
 *   `(bbox.y - padding)` boundary rather than straddle it.
 * - Subsequent wrapped lines step further down by one `lineHeight`.
 *
 * When a translation wraps to more lines than fit above the page bottom
 * margin, the overflow is silently dropped — same behaviour as the
 * footer fallback.
 */
function drawInlineTranslations(
  page: PDFPage,
  paragraphs: readonly PdfTranslationParagraph[],
  font: PDFFont,
): void {
  const lineHeight = INLINE.FONT_SIZE * INLINE.LINE_HEIGHT

  for (const para of paragraphs) {
    const bbox = para.boundingBox
    if (!bbox)
      continue // Defensive: allHaveBoundingBox guarded this, but TS narrowing.
    const maxWidth = Math.max(bbox.width - INLINE.SIDE_PADDING * 2, 1)
    const wrapped = wrapText(para.translation ?? "", font, INLINE.FONT_SIZE, maxWidth)

    // Baseline of the first wrapped line. Place ascenders just under
    // `bbox.y` by subtracting padding + font size.
    let y = bbox.y - INLINE.TOP_PADDING - INLINE.FONT_SIZE
    for (const line of wrapped) {
      // Clip at the bottom of the page (y < 0 means off-page).
      if (y < 0)
        break
      page.drawText(line, {
        x: bbox.x + INLINE.SIDE_PADDING,
        y,
        size: INLINE.FONT_SIZE,
        font,
      })
      y -= lineHeight
    }
  }
}

/**
 * Draw a list of translated paragraphs as a footer block at the bottom of
 * `page`. Paragraphs are numbered `1.`, `2.`, … and wrapped to the page
 * width minus `FOOTER.MARGIN` on each side.
 *
 * We compute draw coordinates in pdf-lib's default bottom-origin
 * coordinate system: y grows upward, (0, 0) is the bottom-left of the
 * page. The footer starts at `FOOTER.MARGIN` from the bottom and walks
 * upward, which means the last translated paragraph renders highest.
 * Given our "bottom margin" intent we invert that — we draw top-down
 * starting from `footerStartY` and let text that overflows the page just
 * get clipped (a future-work item for very-long translations is either
 * splitting across pages or shrinking the font).
 */
function drawFooterTranslations(
  page: PDFPage,
  translations: readonly string[],
  font: PDFFont,
): void {
  const { width, height } = page.getSize()
  const maxWidth = width - FOOTER.MARGIN * 2
  const lineHeight = FOOTER.FONT_SIZE * FOOTER.LINE_HEIGHT

  // Start drawing a few lines above the bottom margin. We reserve space
  // for up to `FOOTER.MAX_LINES` wrapped lines; if the translations need
  // more, the overflow is simply not drawn (documented limitation — see
  // the module-level JSDoc).
  const footerBlockHeight = FOOTER.MAX_LINES * lineHeight
  let y = Math.min(FOOTER.MARGIN + footerBlockHeight, height - FOOTER.MARGIN)

  for (let i = 0; i < translations.length; i++) {
    const text = `${i + 1}. ${translations[i] ?? ""}`
    const wrapped = wrapText(text, font, FOOTER.FONT_SIZE, maxWidth)
    for (const line of wrapped) {
      if (y < FOOTER.MARGIN)
        return
      page.drawText(line, {
        x: FOOTER.MARGIN,
        y,
        size: FOOTER.FONT_SIZE,
        font,
      })
      y -= lineHeight
    }
    y -= FOOTER.PARAGRAPH_GAP
  }
}

/**
 * Greedy word-wrap. Splits on whitespace for Latin-script text and falls
 * back to per-character wrapping for CJK (which has no whitespace between
 * glyphs).
 *
 * Exported via the test entrypoint only — not part of the public API.
 */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (!text)
    return []
  const hasCjk = containsCJK(text)
  // For CJK we wrap per-character (no reliable word boundaries); for
  // Latin we wrap per-whitespace-token.
  const tokens = hasCjk ? Array.from(text) : text.split(/(\s+)/)
  const lines: string[] = []
  let current = ""

  for (const token of tokens) {
    const candidate = current + token
    let candidateWidth: number
    try {
      candidateWidth = font.widthOfTextAtSize(candidate, size)
    }
    catch {
      // `widthOfTextAtSize` throws for glyphs missing from the embedded
      // subset. Fall back to a conservative per-char estimate so we don't
      // crash the whole export on a single exotic character.
      candidateWidth = candidate.length * size * 0.6
    }
    if (candidateWidth <= maxWidth || current.length === 0) {
      current = candidate
    }
    else {
      lines.push(current.trimEnd())
      current = token.trimStart()
    }
  }
  if (current.length > 0)
    lines.push(current.trimEnd())
  return lines
}

/**
 * Test-only re-exports. Not part of the public module surface; consumers
 * should import from the top-level entry.
 */
export const __test = {
  wrapText,
  FOOTER,
  INLINE,
  allHaveBoundingBox,
}
