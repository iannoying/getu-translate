/**
 * Tests for the bilingual PDF exporter (M3 PR#C Task 2).
 *
 * Strategy:
 *   - Build a tiny real PDF up-front using `pdf-lib`'s own `PDFDocument.create()`
 *     so the fetch-mock can hand the exporter valid bytes it can actually
 *     load. Creating a PDF from scratch is cheaper than maintaining a
 *     hand-rolled fixture and guarantees `PDFDocument.load` succeeds.
 *   - Stub `fetch` globally so we can respond with (a) the original PDF
 *     bytes when asked for `options.src` and (b) synthetic CJK font bytes
 *     when the exporter tries to fetch the Noto Sans CJK font. The font
 *     fetch is only expected on CJK-bearing inputs so Latin-only tests
 *     assert it never fires.
 *   - Mock the `getCachedPage` Dexie helper with `vi.mock` so the test
 *     controls exactly which pages "have" cached translations.
 *
 * The exporter's internal geometry (footer positioning, wrap columns) is
 * covered indirectly: we assert the blob MIME, page count preservation,
 * cache-lookup fan-out, and font-embed branching. Pixel-exact layout
 * assertions would be brittle against pdf-lib version bumps.
 */

import type { PDFFont } from "pdf-lib"
import type { PdfTranslationRow } from "@/utils/db/dexie/pdf-translations"
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Produce a real `PDFFont` instance (Helvetica) we can return from our
 * mocked `embedFont` spy. `drawText` runs an `instanceof PDFFont` check on
 * `options.font`, so a plain object stub fails. Using a real standard-font
 * instance sidesteps fontkit parsing while still satisfying the assert.
 *
 * Note: this real Helvetica cannot encode CJK code points, so tests with
 * CJK translations additionally stub `PDFPage.prototype.drawText` to a
 * no-op recorder — we only care *that* drawText was invoked with the
 * expected font, not that the glyph encoding succeeds against our
 * placeholder font.
 */
async function makeRealStandardFont(): Promise<PDFFont> {
  const doc = await PDFDocument.create()
  return doc.embedFont(StandardFonts.Helvetica)
}

// --- mocks -----------------------------------------------------------------

// The exporter calls `getCachedPage(fileHash, pageIndex, targetLang, providerId)`.
// We mock the module so tests can hand-pick which `(fileHash, pageIndex)` tuples
// have cached rows without touching IndexedDB.
vi.mock("@/utils/db/dexie/pdf-translations", () => ({
  getCachedPage: vi.fn(),
}))

// `getCjkFontUrl()` wraps `browser.runtime.getURL`; pin it to a stable
// value so the fetch mock has a known URL to match against.
vi.mock("@/utils/pdf/font-path", () => ({
  CJK_FONT_PATH: "/assets/fonts/noto-sans-cjk-sc-subset.otf",
  getCjkFontUrl: vi.fn(() => "chrome-extension://fake/assets/fonts/noto-sans-cjk-sc-subset.otf"),
}))

// Pull the mocked symbols out AFTER `vi.mock` so we get the mock fn.
const { getCachedPage } = await import("@/utils/db/dexie/pdf-translations")
const { exportBilingualPdf } = await import("../pdf-lib-writer")

// --- helpers ---------------------------------------------------------------

const PDF_SRC = "https://example.com/paper.pdf"
const FILE_HASH = "deadbeef"
const TARGET_LANG = "zh-CN"
const PROVIDER_ID = "openai"

/**
 * Build a valid 3-page PDF in-memory and return its bytes. The pages are
 * blank — we only care that `PDFDocument.load` can round-trip them.
 */
async function makeFixturePdfBytes(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595.28, 841.89]) // A4
  }
  const bytes = await doc.save()
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

/**
 * Build a minimal OpenType font byte stream we can hand the exporter when
 * it asks for the CJK font. We reuse a Helvetica-like tiny OTF by embedding
 * a real OTF-ish fixture via `pdf-lib`. Easiest: generate any font bytes
 * by loading our own PDF, which won't actually work — so instead we ship
 * a tiny pre-made TTF byte stream. The exporter's production code passes
 * these bytes to `pdfDoc.embedFont(bytes, { subset: true })`, which runs
 * fontkit parsing. To avoid shipping a binary fixture, we instead avoid
 * triggering CJK embed by controlling inputs; when a test *does* want CJK,
 * we intercept the font fetch and short-circuit via a spy on `embedFont`.
 */
function fakeResponse(
  body: ArrayBuffer,
  { ok = true, status = 200 }: { ok?: boolean, status?: number } = {},
): Response {
  return {
    ok,
    status,
    arrayBuffer: () => Promise.resolve(body),
  } as unknown as Response
}

/**
 * Build a `PdfTranslationRow` with paragraph translations for the given page.
 */
function makeRow(
  pageIndex: number,
  translations: string[],
  overrides: Partial<PdfTranslationRow> = {},
): PdfTranslationRow {
  return {
    id: `${FILE_HASH}:${pageIndex}`,
    fileHash: FILE_HASH,
    pageIndex,
    targetLang: TARGET_LANG,
    providerId: PROVIDER_ID,
    paragraphs: translations.map((t, i) => ({
      srcHash: `src-${pageIndex}-${i}`,
      translation: t,
    })),
    createdAt: 1,
    lastAccessedAt: 1,
    ...overrides,
  }
}

/**
 * Variant of `makeRow` where every paragraph carries a distinct bounding
 * box. Used to exercise the inline-draw path introduced by the M3
 * follow-up.
 */
function makeRowWithBboxes(
  pageIndex: number,
  translations: string[],
  bboxes: Array<{ x: number, y: number, width: number, height: number }>,
  overrides: Partial<PdfTranslationRow> = {},
): PdfTranslationRow {
  if (translations.length !== bboxes.length)
    throw new Error("translations and bboxes must be the same length")
  return {
    id: `${FILE_HASH}:${pageIndex}`,
    fileHash: FILE_HASH,
    pageIndex,
    targetLang: TARGET_LANG,
    providerId: PROVIDER_ID,
    paragraphs: translations.map((t, i) => ({
      srcHash: `src-${pageIndex}-${i}`,
      translation: t,
      boundingBox: bboxes[i],
    })),
    createdAt: 1,
    lastAccessedAt: 1,
    ...overrides,
  }
}

// --- test suite ------------------------------------------------------------

describe("exportBilingualPdf", () => {
  const fetchMock = vi.fn()
  const getCachedPageMock = vi.mocked(getCachedPage)

  beforeEach(() => {
    fetchMock.mockReset()
    getCachedPageMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns a Blob with MIME application/pdf", async () => {
    const pdfBytes = await makeFixturePdfBytes(1)
    fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))
    getCachedPageMock.mockResolvedValue(null) // no cached translations

    const blob = await exportBilingualPdf({
      src: PDF_SRC,
      fileHash: FILE_HASH,
      targetLang: TARGET_LANG,
      providerId: PROVIDER_ID,
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe("application/pdf")
    // PDF bytes start with "%PDF-" (0x25 0x50 0x44 0x46 0x2D).
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes.slice(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]))
    expect(bytes.length).toBeGreaterThan(0)
  })

  it("fetches the PDF with credentials omitted and throws on non-OK HTTP status", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(new ArrayBuffer(0), { ok: false, status: 404 }),
    )

    await expect(
      exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      }),
    ).rejects.toThrow(/HTTP 404/)

    expect(fetchMock).toHaveBeenCalledWith(PDF_SRC, { credentials: "omit" })
    expect(getCachedPageMock).not.toHaveBeenCalled()
  })

  it("calls getCachedPage once per page in the source PDF", async () => {
    const pdfBytes = await makeFixturePdfBytes(3)
    fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))
    getCachedPageMock.mockResolvedValue(null)

    await exportBilingualPdf({
      src: PDF_SRC,
      fileHash: FILE_HASH,
      targetLang: TARGET_LANG,
      providerId: PROVIDER_ID,
    })

    expect(getCachedPageMock).toHaveBeenCalledTimes(3)
    // Called with (fileHash, pageIndex, targetLang, providerId) for each page
    // in order.
    for (let i = 0; i < 3; i++) {
      expect(getCachedPageMock).toHaveBeenNthCalledWith(
        i + 1,
        FILE_HASH,
        i,
        TARGET_LANG,
        PROVIDER_ID,
      )
    }
  })

  it("skips pages with no cached translations without throwing", async () => {
    const pdfBytes = await makeFixturePdfBytes(2)
    fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))
    getCachedPageMock.mockResolvedValue(null)

    const blob = await exportBilingualPdf({
      src: PDF_SRC,
      fileHash: FILE_HASH,
      targetLang: TARGET_LANG,
      providerId: PROVIDER_ID,
    })

    // Never fetches the font when there are no translations to draw.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(blob.type).toBe("application/pdf")
  })

  it("embeds Helvetica (no font fetch) when all cached translations are Latin-only", async () => {
    const pdfBytes = await makeFixturePdfBytes(1)
    fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))
    getCachedPageMock.mockResolvedValueOnce(
      makeRow(0, ["Hello world", "Another paragraph"]),
    )

    // Spy on PDFDocument.prototype.embedFont so we can assert what got embedded
    // without touching pdf-lib internals directly.
    const embedFontSpy = vi.spyOn(PDFDocument.prototype, "embedFont")

    await exportBilingualPdf({
      src: PDF_SRC,
      fileHash: FILE_HASH,
      targetLang: TARGET_LANG,
      providerId: PROVIDER_ID,
    })

    // Exactly one embed for Latin; no font URL fetch.
    expect(embedFontSpy).toHaveBeenCalledTimes(1)
    expect(embedFontSpy).toHaveBeenCalledWith(StandardFonts.Helvetica)
    // Only the original PDF fetch — no second fetch for a font.
    expect(fetchMock).toHaveBeenCalledTimes(1)

    embedFontSpy.mockRestore()
  })

  it("fetches the CJK font and embeds it with subset=true when any translation contains CJK", async () => {
    const pdfBytes = await makeFixturePdfBytes(1)

    // First fetch: PDF bytes. Second fetch: CJK font bytes — the bytes
    // themselves are fake, so we stub `embedFont` below to skip fontkit's
    // real parse and return a real (Latin) PDFFont instance we build up
    // front.
    fetchMock
      .mockResolvedValueOnce(fakeResponse(pdfBytes))
      .mockResolvedValueOnce(fakeResponse(new Uint8Array([0x00, 0x01, 0x02]).buffer))

    getCachedPageMock.mockResolvedValueOnce(
      makeRow(0, ["你好世界", "翻译测试"]),
    )

    const realFont = await makeRealStandardFont()
    const embedFontSpy = vi
      .spyOn(PDFDocument.prototype, "embedFont")
      .mockResolvedValue(realFont)
    // See `makeRealStandardFont` JSDoc: the placeholder font can't encode
    // CJK, so short-circuit the actual rendering. We assert what the
    // exporter embedded via `embedFontSpy` instead.
    const drawTextSpy = vi
      .spyOn(PDFPage.prototype, "drawText")
      .mockImplementation(() => {})

    const blob = await exportBilingualPdf({
      src: PDF_SRC,
      fileHash: FILE_HASH,
      targetLang: TARGET_LANG,
      providerId: PROVIDER_ID,
    })

    // One PDF fetch + one CJK font fetch.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(1, PDF_SRC, { credentials: "omit" })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "chrome-extension://fake/assets/fonts/noto-sans-cjk-sc-subset.otf",
    )

    // Font embedded from bytes with subset option.
    expect(embedFontSpy).toHaveBeenCalledTimes(1)
    const call = embedFontSpy.mock.calls[0]
    expect(call).toBeDefined()
    expect(call![0]).toBeInstanceOf(ArrayBuffer)
    expect(call![1]).toEqual({ subset: true })

    // drawText was exercised for each paragraph's wrapped lines on the
    // CJK-bearing page.
    expect(drawTextSpy).toHaveBeenCalled()

    expect(blob.type).toBe("application/pdf")

    embedFontSpy.mockRestore()
    drawTextSpy.mockRestore()
  })

  it("embeds at most one CJK font even across multiple CJK-bearing pages", async () => {
    const pdfBytes = await makeFixturePdfBytes(3)
    // PDF bytes + one CJK font fetch (expected to be reused across pages).
    fetchMock
      .mockResolvedValueOnce(fakeResponse(pdfBytes))
      .mockResolvedValueOnce(fakeResponse(new Uint8Array([0x00, 0x01]).buffer))

    getCachedPageMock
      .mockResolvedValueOnce(makeRow(0, ["你好"]))
      .mockResolvedValueOnce(makeRow(1, ["世界"]))
      .mockResolvedValueOnce(makeRow(2, ["翻译"]))

    const realFont = await makeRealStandardFont()
    const embedFontSpy = vi
      .spyOn(PDFDocument.prototype, "embedFont")
      .mockResolvedValue(realFont)
    const drawTextSpy = vi
      .spyOn(PDFPage.prototype, "drawText")
      .mockImplementation(() => {})

    await exportBilingualPdf({
      src: PDF_SRC,
      fileHash: FILE_HASH,
      targetLang: TARGET_LANG,
      providerId: PROVIDER_ID,
    })

    // Exactly one font fetch and one embed — the memoization kicked in.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(embedFontSpy).toHaveBeenCalledTimes(1)

    embedFontSpy.mockRestore()
    drawTextSpy.mockRestore()
  })

  it("embeds both Latin and CJK fonts when pages have different scripts", async () => {
    const pdfBytes = await makeFixturePdfBytes(2)
    fetchMock
      .mockResolvedValueOnce(fakeResponse(pdfBytes))
      .mockResolvedValueOnce(fakeResponse(new Uint8Array([0x00]).buffer))

    getCachedPageMock
      .mockResolvedValueOnce(makeRow(0, ["Plain latin paragraph"]))
      .mockResolvedValueOnce(makeRow(1, ["你好世界"]))

    const realFont = await makeRealStandardFont()
    const embedFontSpy = vi
      .spyOn(PDFDocument.prototype, "embedFont")
      .mockResolvedValue(realFont)
    const drawTextSpy = vi
      .spyOn(PDFPage.prototype, "drawText")
      .mockImplementation(() => {})

    await exportBilingualPdf({
      src: PDF_SRC,
      fileHash: FILE_HASH,
      targetLang: TARGET_LANG,
      providerId: PROVIDER_ID,
    })

    // Two embeds: Helvetica for page 0, CJK bytes for page 1.
    expect(embedFontSpy).toHaveBeenCalledTimes(2)
    const calls = embedFontSpy.mock.calls
    // One call uses the StandardFonts.Helvetica string constant…
    expect(calls.some(c => c[0] === StandardFonts.Helvetica)).toBe(true)
    // …and the other uses ArrayBuffer bytes with subset: true.
    expect(
      calls.some(
        c =>
          c[0] instanceof ArrayBuffer
          && (c[1] as { subset?: boolean } | undefined)?.subset === true,
      ),
    ).toBe(true)

    embedFontSpy.mockRestore()
    drawTextSpy.mockRestore()
  })

  it("throws when the CJK font fetch returns non-OK", async () => {
    const pdfBytes = await makeFixturePdfBytes(1)
    fetchMock
      .mockResolvedValueOnce(fakeResponse(pdfBytes))
      .mockResolvedValueOnce(
        fakeResponse(new ArrayBuffer(0), { ok: false, status: 500 }),
      )

    getCachedPageMock.mockResolvedValueOnce(makeRow(0, ["你好"]))

    await expect(
      exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      }),
    ).rejects.toThrow(/CJK font fetch failed.*HTTP 500/)
  })

  // --- M3 follow-up: inline bounding-box layout ----------------------------

  describe("inline bounding-box layout (M3 follow-up)", () => {
    /**
     * Helper: spy on `PDFPage.prototype.drawText` and collect the draw calls
     * into an array of `{ text, x, y }` so tests can assert inline placement
     * without depending on pdf-lib's internal graphics state. The spy is
     * restored by the caller.
     */
    function spyOnDrawText(): {
      spy: ReturnType<typeof vi.spyOn>
      calls: Array<{ text: string, x: number, y: number, font: unknown }>
    } {
      const calls: Array<{ text: string, x: number, y: number, font: unknown }> = []
      const spy = vi
        .spyOn(PDFPage.prototype, "drawText")
        .mockImplementation((text: string, options?: unknown) => {
          const opts = (options ?? {}) as { x?: number, y?: number, font?: unknown }
          calls.push({
            text,
            x: opts.x ?? 0,
            y: opts.y ?? 0,
            font: opts.font,
          })
        })
      return { spy, calls }
    }

    it("inline path: draws each translation at (bbox.x, bbox.y - padding - fontSize)", async () => {
      const pdfBytes = await makeFixturePdfBytes(1)
      fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))

      // Bbox at the top of an A4 page (y=700) so drawn baseline stays > 0.
      getCachedPageMock.mockResolvedValueOnce(
        makeRowWithBboxes(
          0,
          ["Short translation"],
          [{ x: 72, y: 700, width: 450, height: 14 }],
        ),
      )

      const { spy, calls } = spyOnDrawText()

      await exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      })

      expect(calls).toHaveLength(1)
      const call = calls[0]
      expect(call.text).toBe("Short translation")
      expect(call.x).toBe(72)
      // y should be bbox.y - TOP_PADDING - FONT_SIZE = 700 - 2 - 9 = 689.
      // The footer fallback would use FOOTER.MARGIN or similar (36 or a
      // much larger offset), so 689 is a load-bearing assertion that the
      // inline path ran.
      expect(call.y).toBe(689)

      spy.mockRestore()
    })

    it("inline path: y-flip demonstration — higher bbox.y means higher draw position", async () => {
      // Two paragraphs on one page at different heights. The upper one
      // (bbox.y=600) should produce a draw call at y ~= 570 (or thereabouts),
      // which is strictly greater than the lower paragraph's draw y.
      // pdf-lib's coordinate system has y growing upward, so "higher on
      // page" = "larger y".
      const pdfBytes = await makeFixturePdfBytes(1)
      fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))

      getCachedPageMock.mockResolvedValueOnce(
        makeRowWithBboxes(
          0,
          ["Upper translation", "Lower translation"],
          [
            { x: 72, y: 600, width: 450, height: 14 },
            { x: 72, y: 400, width: 450, height: 14 },
          ],
        ),
      )

      const { spy, calls } = spyOnDrawText()

      await exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      })

      expect(calls.length).toBeGreaterThanOrEqual(2)
      const upper = calls.find(c => c.text === "Upper translation")!
      const lower = calls.find(c => c.text === "Lower translation")!
      expect(upper).toBeDefined()
      expect(lower).toBeDefined()
      // Upper paragraph's translation is drawn near y=589, lower near y=389.
      // Invariant: larger bbox.y → larger draw y.
      expect(upper.y).toBeGreaterThan(lower.y)
      // Exact placement: bbox.y - TOP_PADDING(2) - FONT_SIZE(9).
      expect(upper.y).toBe(589)
      expect(lower.y).toBe(389)

      spy.mockRestore()
    })

    it("fallback: any missing bbox → entire page uses footer layout", async () => {
      const pdfBytes = await makeFixturePdfBytes(1)
      fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))

      // Two paragraphs, one with bbox, one without — page must fall back
      // to the footer layout across the board, not draw some inline + some
      // footer.
      const row: PdfTranslationRow = {
        id: `${FILE_HASH}:0`,
        fileHash: FILE_HASH,
        pageIndex: 0,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
        paragraphs: [
          {
            srcHash: "a",
            translation: "With bbox paragraph",
            boundingBox: { x: 72, y: 700, width: 450, height: 14 },
          },
          {
            srcHash: "b",
            translation: "Without bbox paragraph",
          },
        ],
        createdAt: 1,
        lastAccessedAt: 1,
      }
      getCachedPageMock.mockResolvedValueOnce(row)

      const { spy, calls } = spyOnDrawText()

      await exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      })

      // Footer layout numbers paragraphs ("1. …", "2. …") and draws from
      // FOOTER.MARGIN=36. The inline path would have produced text starting
      // with the raw translation and an x=72. Assert we see the numbered
      // prefix and the footer x offset.
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) {
        expect(call.x).toBe(36) // FOOTER.MARGIN
      }
      expect(calls.some(c => c.text.startsWith("1. "))).toBe(true)
      expect(calls.some(c => c.text.startsWith("2. "))).toBe(true)

      spy.mockRestore()
    })

    it("fallback: legacy row with no bboxes on any paragraph uses footer layout", async () => {
      const pdfBytes = await makeFixturePdfBytes(1)
      fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))

      getCachedPageMock.mockResolvedValueOnce(
        makeRow(0, ["Legacy paragraph one", "Legacy paragraph two"]),
      )

      const { spy, calls } = spyOnDrawText()

      await exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      })

      // Footer-numbered output at FOOTER.MARGIN x-offset.
      for (const call of calls) {
        expect(call.x).toBe(36)
      }
      expect(calls.some(c => c.text.startsWith("1. "))).toBe(true)
      expect(calls.some(c => c.text.startsWith("2. "))).toBe(true)

      spy.mockRestore()
    })

    it("inline path: CJK translation draws with the CJK font at bbox coordinates", async () => {
      const pdfBytes = await makeFixturePdfBytes(1)
      fetchMock
        .mockResolvedValueOnce(fakeResponse(pdfBytes))
        .mockResolvedValueOnce(fakeResponse(new Uint8Array([0x00, 0x01]).buffer))

      getCachedPageMock.mockResolvedValueOnce(
        makeRowWithBboxes(
          0,
          ["你好世界"],
          [{ x: 100, y: 500, width: 400, height: 14 }],
        ),
      )

      const realFont = await makeRealStandardFont()
      const embedFontSpy = vi
        .spyOn(PDFDocument.prototype, "embedFont")
        .mockResolvedValue(realFont)

      const { spy, calls } = spyOnDrawText()

      await exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      })

      // CJK font fetched + embedded once.
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(embedFontSpy).toHaveBeenCalledTimes(1)

      // The drawn text is the translation (no footer numeric prefix) and
      // x matches bbox.x — i.e. we went down the inline path.
      expect(calls.length).toBeGreaterThanOrEqual(1)
      expect(calls[0].text).toBe("你好世界")
      expect(calls[0].x).toBe(100)
      expect(calls[0].y).toBe(489) // 500 - 2 - 9

      embedFontSpy.mockRestore()
      spy.mockRestore()
    })

    it("inline path: long translation wraps within bbox.width", async () => {
      const pdfBytes = await makeFixturePdfBytes(1)
      fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))

      // Narrow bbox forces wrapping. The source translation is much longer
      // than a single line at width=50.
      getCachedPageMock.mockResolvedValueOnce(
        makeRowWithBboxes(
          0,
          ["This translation has many words that must be wrapped across multiple lines"],
          [{ x: 72, y: 700, width: 50, height: 14 }],
        ),
      )

      const { spy, calls } = spyOnDrawText()

      await exportBilingualPdf({
        src: PDF_SRC,
        fileHash: FILE_HASH,
        targetLang: TARGET_LANG,
        providerId: PROVIDER_ID,
      })

      // Expect multiple draw calls (one per wrapped line), each at the
      // same x, with y decreasing monotonically as we walk down the page.
      expect(calls.length).toBeGreaterThan(1)
      for (const call of calls) {
        expect(call.x).toBe(72)
      }
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i].y).toBeLessThan(calls[i - 1].y)
      }

      spy.mockRestore()
    })
  })
})
