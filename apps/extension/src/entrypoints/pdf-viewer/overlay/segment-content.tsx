/**
 * Tiny React component that renders one segment's current translation status
 * as slot content (PR #B2 Task 4).
 *
 * Subscribes to `segmentStatusAtomFamily(key)` and returns:
 *   - `pending` / `translating` → the `[...]` placeholder (lets the Slot's
 *     default fall-through also work, but we return it explicitly so callers
 *     that pass a non-nullish child still see a placeholder while waiting).
 *   - `done`                    → the translated text.
 *   - `error`                   → `[×]` glyph + the message as a `title`
 *     (tooltip) for diagnosability without blowing up the overlay layout.
 *
 * The component is intentionally dumb: no side effects, no scheduler calls.
 * The scheduler (instantiated in `main.ts`) is the sole writer; this
 * component is the sole reader for slot content.
 */
import type { SegmentKey } from "../translation/atoms"
import { useAtomValue } from "jotai"
import * as React from "react"
import { i18n } from "@/utils/i18n"
import { segmentStatusAtomFamily } from "../translation/atoms"

const PENDING_PLACEHOLDER = "[...]"
const ERROR_GLYPH = "[×]"

export interface SegmentContentProps {
  /** Fully-qualified `${fileHash}:${paragraph.key}` identity. */
  segmentKey: SegmentKey
}

export function SegmentContent({ segmentKey }: SegmentContentProps): React.ReactElement {
  const status = useAtomValue(segmentStatusAtomFamily(segmentKey))

  switch (status.kind) {
    case "done":
      return <span className="getu-slot-translation">{status.translation}</span>
    case "error":
      return (
        <span
          className="getu-slot-error"
          title={i18n.t("pdfViewer.segmentContent.errorTooltip")}
          aria-label={i18n.t("pdfViewer.segmentContent.errorAriaLabel", [status.message])}
        >
          {ERROR_GLYPH}
        </span>
      )
    case "translating":
    case "pending":
    default:
      return <span className="getu-slot-placeholder">{PENDING_PLACEHOLDER}</span>
  }
}
