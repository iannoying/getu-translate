export type PdfSegment = {
  index: number
  source: string
  translation: string
  startPage: number
  endPage: number
  modelId: string
}

export type PdfSegmentsFile = {
  jobId: string
  modelId: string
  sourceLang: string
  targetLang: string
  segments: PdfSegment[]
  generatedAt: string
}

export type PageSegments = {
  page: number
  segments: PdfSegment[]
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1
}

function isSegment(value: unknown): value is PdfSegment {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (!isNonNegativeInteger(v.index) || !isPositiveInteger(v.startPage) || !isPositiveInteger(v.endPage)) {
    return false
  }
  return typeof v.source === "string"
    && typeof v.translation === "string"
    && v.endPage >= v.startPage
    && typeof v.modelId === "string"
}

export function parseSegmentsFile(value: unknown): PdfSegmentsFile {
  if (!value || typeof value !== "object") throw new Error("Invalid segments file")
  const v = value as Record<string, unknown>
  if (
    typeof v.jobId !== "string"
    || typeof v.modelId !== "string"
    || typeof v.sourceLang !== "string"
    || typeof v.targetLang !== "string"
    || typeof v.generatedAt !== "string"
    || !Array.isArray(v.segments)
    || !v.segments.every(isSegment)
  ) {
    throw new Error("Invalid segments file")
  }
  return v as PdfSegmentsFile
}

export function groupSegmentsByPage(file: PdfSegmentsFile, pageCount: number): PageSegments[] {
  const pages = Array.from({ length: pageCount }, (_, idx) => ({
    page: idx + 1,
    segments: [] as PdfSegment[],
  }))
  for (const segment of file.segments) {
    const page = pages[segment.startPage - 1]
    if (page) page.segments.push(segment)
  }
  for (const page of pages) {
    page.segments.sort((a, b) => a.index - b.index)
  }
  return pages
}
