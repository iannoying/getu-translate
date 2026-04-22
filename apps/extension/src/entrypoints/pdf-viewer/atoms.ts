/**
 * Viewer-level Jotai atoms (PR #B3 Task 5).
 *
 * Unlike `translation/atoms.ts` which owns per-segment state, this module owns
 * state shared by all pages of a single viewer lifetime. Currently limited to
 * the UpgradeDialog visibility flag; future tasks can add other viewer-wide
 * toggles here.
 *
 * Writes go through `pdfViewerStore.set(...)` from main.ts (imperative), reads
 * go through `useAtomValue` in the React component that mounts the dialog.
 */
import { atom } from "jotai"

/**
 * Controls visibility of the PDF-translation UpgradeDialog.
 *
 * `main.ts` flips this to `true` when the Free-tier daily page limit has
 * been hit — i.e. the 50th fresh page has just completed translation and
 * the counter reached `FREE_PDF_PAGES_PER_DAY` (matching the `>= limit`
 * check in main.ts's `onPageSuccess` handler). The dialog's own
 * `onOpenChange` callback flips it back to `false` when the user closes
 * the dialog or clicks through to a purchase flow.
 *
 * Default: `false` — the dialog is mounted but invisible until quota
 * exhaustion or another paywall trigger fires.
 */
export const showPdfUpgradeDialogAtom = atom<boolean>(false)
