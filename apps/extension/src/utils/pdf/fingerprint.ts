/**
 * Deterministic fingerprint for a PDF src URL.
 *
 * The fingerprint prefixes every `SegmentKey` (`${fileHash}:${paragraph.key}`)
 * in the shared Jotai store so segments from different open PDFs don't
 * collide. For PR #B2 we only need a deterministic function of the `?src=`
 * URL — two viewer tabs opened on the same PDF should share translations,
 * two different PDFs must not collide.
 *
 * B2: synchronous sha256 of the src string. Cheap and stable per URL.
 * B3: will switch to async content-based hashing (fetch PDF bytes →
 *     `crypto.subtle.digest`) to support the same PDF served from different
 *     URLs sharing a cache entry, and a cache that survives server-side URL
 *     changes. That swap changes this function's return type to
 *     `Promise<string>` and requires the call site in
 *     `entrypoints/pdf-viewer/main.ts` to become
 *     `await fingerprintForSrc(src)`.
 */
import { Sha256Hex } from "../hash"

/**
 * Compute a deterministic fingerprint for a PDF identified by its `?src=` URL.
 *
 * Same input → same hash (required so segment atoms line up across re-opens
 * within a single session). Returns a hex string; callers should treat it
 * as an opaque identifier.
 */
export function fingerprintForSrc(src: string): string {
  return Sha256Hex(src)
}
