/**
 * Deterministic fingerprint for a PDF file.
 *
 * The fingerprint prefixes every `SegmentKey` (`${fileHash}:${paragraph.key}`)
 * in the shared Jotai store so segments from different open PDFs don't
 * collide, and also keys the Dexie `pdfTranslations` cache so the same file
 * served from a different URL still hits the same cache row.
 *
 * B3: async content-based hashing — fetch PDF bytes + `crypto.subtle.digest`
 *     so the same file at different URLs shares a cache entry. Falls back to
 *     a sync hash of the `?src=` URL when the fetch fails (network error,
 *     CORS, file:// without access) so the viewer still renders and still
 *     gets a deterministic (per-URL) key.
 */
import { Sha256Hex } from "../hash"

/**
 * Convert an `ArrayBuffer` (32-byte SHA-256) into a lower-case hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ""
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return hex
}

/**
 * Compute a deterministic fingerprint for a PDF identified by its `?src=` URL.
 *
 * Happy path: fetches the PDF bytes (no credentials per PR #A hardening) and
 * hashes them with `crypto.subtle.digest("SHA-256", ...)`. Same file bytes →
 * same hash regardless of the URL that served them.
 *
 * Fallback path: if the fetch fails for any reason, we log a warning and
 * fall back to `Sha256Hex(src)` so the viewer can still render and segment
 * atoms stay consistent within the session. The fallback hash is
 * deterministic per URL but will not match the content hash, so a later
 * successful fetch will key into a different cache row (acceptable trade-off
 * — we prefer a working viewer over a unified cache here).
 */
export async function fingerprintForPdf(src: string): Promise<string> {
  try {
    const res = await fetch(src, { credentials: "omit" })
    if (!res.ok) {
      throw new Error(`Fetch failed: HTTP ${res.status}`)
    }
    const bytes = await res.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes)
    return bufferToHex(hashBuffer)
  }
  catch (err) {
    console.warn(
      "[pdf-viewer] fingerprintForPdf fetch failed, falling back to URL hash:",
      err,
    )
    return Sha256Hex(src)
  }
}
