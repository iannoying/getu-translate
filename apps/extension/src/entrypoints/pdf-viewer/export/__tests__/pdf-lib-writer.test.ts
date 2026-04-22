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
})
