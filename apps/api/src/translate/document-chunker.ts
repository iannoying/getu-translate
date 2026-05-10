import type { PdfPage } from "./pdf-extract"

export type Chunk = {
  index: number
  text: string
  startPage: number
  endPage: number
}

const TARGET_MAX = 3500
const TARGET_MAX_ENCODED_Q = 12_000
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
      if (exceedsTarget(para)) {
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
      if (exceedsTarget(buffer + separator + para)) {
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
  // Try sentence boundaries first (includes Chinese sentence terminators)
  const sentences = text.match(/[^.!?。！？]+(?:[.!?。！？]+["')\]」』]?\s*|$)/gu) ?? [text]
  const out: string[] = []
  let buf = ""

  for (const s of sentences) {
    if (exceedsTarget(buf + s)) {
      pushPiece(out, buf)
      if (exceedsTarget(s)) {
        out.push(...splitByBudget(s))
        buf = ""
      } else {
        buf = s
      }
    } else {
      buf += s
    }
  }

  pushPiece(out, buf)
  return out
}

function exceedsTarget(text: string): boolean {
  return text.length > TARGET_MAX || encodedQueryLength(text) > TARGET_MAX_ENCODED_Q
}

function encodedQueryLength(text: string): number {
  return new URLSearchParams({ q: text }).toString().length
}

function splitByBudget(text: string): string[] {
  const out: string[] = []
  let buf = ""
  for (const ch of text) {
    if (buf && exceedsTarget(buf + ch)) {
      pushPiece(out, buf)
      buf = ch
    } else {
      buf += ch
    }
  }
  pushPiece(out, buf)
  return out
}

function pushPiece(out: string[], piece: string): void {
  if (piece.trim()) out.push(piece)
}
