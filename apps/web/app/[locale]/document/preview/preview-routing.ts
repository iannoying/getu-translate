export function normalizePreviewJobId(value: string): string {
  return value.replace(/\/+$/g, "")
}
