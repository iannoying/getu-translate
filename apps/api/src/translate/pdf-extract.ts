import { extractText } from "unpdf"

export type PdfPage = {
  pageNumber: number
  text: string
}

export type PdfExtractResult = {
  pages: PdfPage[]
  scanned: boolean
  totalPages: number
}

export async function extractTextFromPdf(
  buffer: ArrayBuffer | Uint8Array | Buffer,
): Promise<PdfExtractResult> {
  // Buffer is a subclass of Uint8Array but unpdf's pdfjs internals reject it.
  // Uint8Array.from() iterates the typed-array values and produces a plain Uint8Array
  // with its own backing ArrayBuffer — safe for both Buffer and ArrayBuffer inputs.
  const u8: Uint8Array =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : Uint8Array.from(buffer as Uint8Array)

  const { totalPages, text } = await extractText(u8, { mergePages: false })

  const pages: PdfPage[] = text.map((pageText, idx) => ({
    pageNumber: idx + 1,
    text: pageText,
  }))

  const scanned = pages.every((p) => p.text.trim().length === 0)

  return { pages, scanned, totalPages }
}
