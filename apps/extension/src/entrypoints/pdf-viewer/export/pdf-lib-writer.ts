/**
 * Bilingual PDF exporter (M3 PR#C Task 2, Pro tier).
 *
 * Given an original PDF URL + the keys into the Dexie `pdfTranslations`
 * cache, re-writes the PDF with translated paragraphs appended to each page
 * so a Pro user can download a bilingual copy of the source they just
 * translated in the viewer.
 *
 * # Scope of this module
 *
 * Task 2 is the pure export pipeline: fetch → load → walk pages → draw →
 * serialize. Wiring it to a UI button (loading states, download trigger,
 * entitlement gating) lives in Task 3, and the CJK font asset drop-in is a
 * one-time ops step documented in
 * `apps/extension/public/assets/fonts/README.md`.
 *
 * # Why a footer layout, not inline
 *
 * The current Dexie cache row shape (`PdfTranslationParagraph`) only stores
 * `{ srcHash, translation }` — it intentionally does **not** record each
 * paragraph's bounding box. That means we can't draw a translation directly
 * below the matching source paragraph without either (a) extending the
 * cache schema or (b) re-running text extraction at export time. Both are
 * viable but land outside this task's surface.
 *
 * For the MVP export we render all translated paragraphs for a page as a
 * footer block in the bottom margin of that same page, prefixed with a
 * numeric marker. Readers can still cross-reference "paragraph 1 /
 * paragraph 2" against the original layout; the export is useful even
 * without spatial alignment, and the footer layout is robust across PDFs
 * with wildly different geometry.
 *
 * Follow-up: PR #C+1 should extend `PdfTranslationParagraph` with an
 * optional `boundingBox` (PDF-unit coords) so the writer can switch to an
 * inline "draw translation directly under the source paragraph" layout.
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
 * Footer layout constants. Kept module-private so tests can assert behavior
 * without coupling to specific pixel offsets.
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

  // 4. Walk every page and draw any cached translations as a footer block.
  // A cache miss (or config-mismatch miss) leaves the page untouched — we
  // silently skip rather than throw so partial translations still export.
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

    drawFooterTranslations(page, cached.paragraphs.map(p => p.translation), font)
  }

  // 5. Serialize to a Blob. `Uint8Array` → Blob cast is safe: pdf-lib's
  // `save()` returns a fresh buffer we can hand directly to the Blob
  // constructor.
  const outBytes = await pdfDoc.save()
  return new Blob([outBytes as BlobPart], { type: "application/pdf" })
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
 * Greedy word-wrap for the footer block. Splits on whitespace for
 * Latin-script text and falls back to per-character wrapping for CJK
 * (which has no whitespace between glyphs).
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
}
