/**
 * Parse a `SegmentKey` of the form `${fileHash}:p-${pageIndex}-${paragraphIndex}`
 * back into `(pageIndex, paragraphIndex)`.
 *
 * Used by the scheduler → coordinator bridge (PR #B3 Task 4): the scheduler's
 * `setStatus` callback receives a bare `SegmentKey`, but the
 * `PageCacheCoordinator` tracks completion per `(pageIndex, paragraphIndex)`.
 * Rather than plumb both identifiers through the scheduler API, we trust the
 * stable key format defined in `paragraph/aggregate.ts` and parse it back.
 *
 * Extracted into its own module so unit tests can import it without dragging
 * `main.ts` (which has a top-level `boot()` side effect) into the test
 * environment.
 *
 * Returns `null` if the key doesn't match the expected format (e.g. an older
 * file's malformed key, or a future key format with additional segments).
 * Callers treat `null` as "not our paragraph" and skip the coordinator
 * notification — this keeps the bridge forward-compatible.
 */
import type { SegmentKey } from "./atoms"

export function parseSegmentKey(
  key: SegmentKey,
): { pageIndex: number, paragraphIndex: number } | null {
  // Key format: `${fileHash}:p-${pageIndex}-${paragraphIndex}`
  // fileHash is opaque (may contain non-`:` chars). Split on the FIRST `:`
  // to isolate the paragraph-key suffix, then regex the suffix.
  const sep = key.indexOf(":")
  if (sep < 0)
    return null
  const suffix = key.slice(sep + 1)
  const match = /^p-(\d+)-(\d+)$/.exec(suffix)
  if (!match)
    return null
  const pageIndex = Number(match[1])
  const paragraphIndex = Number(match[2])
  if (!Number.isFinite(pageIndex) || !Number.isFinite(paragraphIndex))
    return null
  return { pageIndex, paragraphIndex }
}
