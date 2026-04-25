import { WEB_DOCUMENT_TRANSLATE_URL } from "@/utils/constants/url"

/**
 * Synchronous best-effort PDF detector for a tab/page URL.
 *
 * Hits:
 *   1. Path ends with `.pdf` (case-insensitive). The 90% case.
 *   2. Known PDF endpoints that serve PDFs at extensionless URLs:
 *      - `arxiv.org/pdf/<id>` — academic preprints
 *      - `openreview.net/pdf?id=...` — peer-reviewed venues
 *
 * For everything else (CMS download handlers, blob URLs without an extension,
 * etc.) consult the background `pdf-tab-detect` content-type tracker via the
 * `isTabPdf` message — it observes the actual response header.
 */
export function isPdfLikeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.toLowerCase().endsWith(".pdf"))
      return true
    if (parsed.hostname === "arxiv.org" && parsed.pathname.startsWith("/pdf/"))
      return true
    if (parsed.hostname === "openreview.net" && parsed.pathname === "/pdf")
      return true
    return false
  }
  catch {
    return false
  }
}

/**
 * Builds the web translator URL with the original PDF URL forwarded as `?src=`.
 * The website does not auto-fetch the URL — it just shows the source so the
 * user knows where they came from before uploading.
 */
export function buildWebTranslateUrl(srcUrl: string): string {
  return `${WEB_DOCUMENT_TRANSLATE_URL}?src=${encodeURIComponent(srcUrl)}`
}
