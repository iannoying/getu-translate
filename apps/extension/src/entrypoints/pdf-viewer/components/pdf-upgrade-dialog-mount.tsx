/**
 * PDF viewer UpgradeDialog mount (PR #B3 Task 5 + M3 PR#C Task 4).
 *
 * The viewer's `main.ts` entrypoint is imperative — there's no React tree at
 * module scope that could host a dialog. This tiny component is rendered into
 * a dedicated root (`#upgrade-dialog-root` in `index.html`) wrapped in the
 * same `pdfViewerStore` Jotai provider used by overlays + the first-use
 * toast. It subscribes to `showPdfUpgradeDialogAtom` and delegates to the
 * shared `<UpgradeDialog>` component.
 *
 * Task 4 update: the atom now holds `{ open, source }` rather than a bare
 * boolean, so attribution flows through to the pricing-page CTA regardless
 * of which upsell trigger (daily-limit vs. watermark) opened the dialog.
 * `onOpenChange` preserves the last `source` when the user closes the
 * dialog — the source is only meaningful at open time and the dialog is
 * re-opened with a fresh source on every trigger.
 *
 * Keeping the mount separate from main.ts preserves the invariant that
 * main.ts does no React work at module scope, and lets tests exercise the
 * visibility logic without dragging in the full viewer bootstrap.
 */
import { useAtom } from "jotai"
import { UpgradeDialog } from "@/components/billing/upgrade-dialog"
import { showPdfUpgradeDialogAtom } from "../atoms"

export function PdfUpgradeDialogMount() {
  const [state, setState] = useAtom(showPdfUpgradeDialogAtom)
  return (
    <UpgradeDialog
      open={state.open}
      onOpenChange={open => setState({ ...state, open })}
      source={state.source}
    />
  )
}
