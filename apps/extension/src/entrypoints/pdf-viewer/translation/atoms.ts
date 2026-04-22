/**
 * Per-segment translation status atoms.
 *
 * PR #B2 plumbing: the scheduler (Task 3) will write status transitions into
 * these atoms and `<OverlayLayer>` (Task 4) will read them to swap slot
 * placeholders for real translation text.
 *
 * Key format
 * ----------
 * `SegmentKey` is `${fileHash}:${paragraph.key}` — see
 * `docs/plans/2026-04-21-m3-pdf-translate-pr-b-design.md` for the cross-file
 * identity scheme. `paragraph.key` alone (e.g. `"p-0-0"`) is only unique
 * within a page; the `fileHash` prefix keeps multiple open PDFs from
 * colliding in the shared Jotai store (added in Task 2).
 *
 * Memory note
 * -----------
 * `atomFamily` caches atoms by key for the lifetime of the store. PR #B3
 * will add a cleanup pass on file close. For PR #B2 this is a known
 * bounded leak (grows with number of paragraphs translated in session).
 */
import { atom } from "jotai"
import { atomFamily } from "jotai-family"

/** Cross-file segment identity: `${fileHash}:${paragraph.key}`. */
export type SegmentKey = string

/**
 * Status of a single segment's translation request.
 *
 * State machine (enforced by the scheduler, not the atom itself):
 *   pending → translating → done
 *                        ↘ error
 */
export type SegmentStatus
  = | { kind: "pending" }
    | { kind: "translating" }
    | { kind: "done", translation: string }
    | { kind: "error", message: string }

const INITIAL_STATUS: SegmentStatus = { kind: "pending" }

/**
 * atomFamily of `SegmentStatus` atoms keyed by `SegmentKey`.
 *
 * Calling with the same key returns the same atom instance (family identity),
 * so components and the scheduler share one source of truth per segment.
 */
export const segmentStatusAtomFamily = atomFamily((_key: SegmentKey) =>
  atom<SegmentStatus>(INITIAL_STATUS),
)
