export function getPdfJobBasePrefix(userId: string, jobId: string): string {
  return `pdfs/${userId}/${jobId}`
}

export function buildSegmentsKey(userId: string, jobId: string): string {
  return `${getPdfJobBasePrefix(userId, jobId)}/segments.json`
}

export function buildDocumentOutputKeys(userId: string, jobId: string): {
  segmentsKey: string
  htmlKey: string
  mdKey: string
} {
  const base = getPdfJobBasePrefix(userId, jobId)
  return {
    segmentsKey: `${base}/segments.json`,
    htmlKey: `${base}/output.html`,
    mdKey: `${base}/output.md`,
  }
}
