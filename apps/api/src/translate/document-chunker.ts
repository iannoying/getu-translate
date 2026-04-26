import type { PdfPage } from "./pdf-extract"

export type Chunk = {
  index: number
  text: string
  startPage: number
  endPage: number
}

const TARGET_MAX = 1500
// TARGET_MIN is aspirational only — short total inputs may produce sub-500 chunks

export function chunkParagraphs(pages: PdfPage[]): Chunk[] {
  if (pages.length === 0) return []

  const chunks: Chunk[] = []
  let buffer = ""
  let bufferStartPage = pages[0].pageNumber
  let bufferEndPage = bufferStartPage

  const flush = () => {
    if (buffer.trim().length === 0) {
      buffer = ""
      return
    }
    chunks.push({
      index: chunks.length,
      text: buffer.trim(),
      startPage: bufferStartPage,
      endPage: bufferEndPage,
    })
    buffer = ""
  }

  for (const page of pages) {
    const paragraphs = page.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)

    // Flush when we cross a page boundary so page provenance stays accurate
    if (buffer.length > 0 && page.pageNumber !== bufferEndPage) {
      flush()
      bufferStartPage = page.pageNumber
      bufferEndPage = page.pageNumber
    }

    for (const para of paragraphs) {
      if (para.length > TARGET_MAX) {
        // Flush current buffer first to preserve order
        flush()
        bufferStartPage = page.pageNumber
        bufferEndPage = page.pageNumber

        // Split the oversized paragraph
        for (const piece of splitOversized(para)) {
          chunks.push({
            index: chunks.length,
            text: piece,
            startPage: page.pageNumber,
            endPage: page.pageNumber,
          })
        }
        continue
      }

      // Would adding this paragraph push us over the limit?
      const separator = buffer.length > 0 ? "\n\n" : ""
      if (buffer.length + separator.length + para.length > TARGET_MAX) {
        flush()
        bufferStartPage = page.pageNumber
      }

      if (buffer.length === 0) bufferStartPage = page.pageNumber
      buffer += separator + para
      bufferEndPage = page.pageNumber
    }
  }

  flush()
  return chunks
}

function splitOversized(text: string): string[] {
  // Try sentence boundaries first
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]?\s*/g) ?? [text]
  const out: string[] = []
  let buf = ""

  for (const s of sentences) {
    if (buf.length + s.length > TARGET_MAX) {
      if (buf.trim()) out.push(buf.trim())
      if (s.length > TARGET_MAX) {
        // Hard split at TARGET_MAX
        for (let i = 0; i < s.length; i += TARGET_MAX) {
          out.push(s.slice(i, i + TARGET_MAX).trim())
        }
        buf = ""
      } else {
        buf = s
      }
    } else {
      buf += s
    }
  }

  if (buf.trim()) out.push(buf.trim())
  return out
}
