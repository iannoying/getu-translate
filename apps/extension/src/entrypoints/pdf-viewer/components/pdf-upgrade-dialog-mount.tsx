/**
 * PDF viewer UpgradeDialog mount (PR #B3 Task 5).
 *
 * The viewer's `main.ts` entrypoint is imperative — there's no React tree at
 * module scope that could host a dialog. This tiny component is rendered into
 * a dedicated root (`#upgrade-dialog-root` in `index.html`) wrapped in the
 * same `pdfViewerStore` Jotai provider used by overlays + the first-use
 * toast. It subscribes to `showPdfUpgradeDialogAtom` and delegates to the
 * shared `<UpgradeDialog>` component; main.ts opens the dialog by writing
 * `true` into the atom.
 *
 * Keeping the mount separate from main.ts preserves the invariant that
 * main.ts does no React work at module scope, and lets tests exercise the
 * visibility logic without dragging in the full viewer bootstrap.
 */
import { useAtom } from "jotai"
import { UpgradeDialog } from "@/components/billing/upgrade-dialog"
import { showPdfUpgradeDialogAtom } from "../atoms"

export function PdfUpgradeDialogMount() {
  const [open, setOpen] = useAtom(showPdfUpgradeDialogAtom)
  return (
    <UpgradeDialog
      open={open}
      onOpenChange={setOpen}
      source="pdf-translation-daily-limit"
    />
  )
}
