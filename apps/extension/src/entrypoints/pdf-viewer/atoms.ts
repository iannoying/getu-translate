/**
 * Viewer-level Jotai atoms (PR #B3 Task 5 + M3 PR#C Task 4).
 *
 * Unlike `translation/atoms.ts` which owns per-segment state, this module owns
 * state shared by all pages of a single viewer lifetime. Currently includes
 * the UpgradeDialog visibility / source state and the "has any page been
 * translated this session?" sticky flag used by the Free-tier watermark.
 *
 * Writes go through `pdfViewerStore.set(...)` from main.ts (imperative), reads
 * go through `useAtomValue` in the React component that mounts the dialog or
 * the watermark.
 */
import { atom } from "jotai"

/**
 * Attribution tag for analytics — distinguishes *which* upsell trigger opened
 * the UpgradeDialog. Matches the `source` param propagated to the pricing
 * page via the website CTA.
 *
 * - `pdf-translation-daily-limit` — Free user hit `FREE_PDF_PAGES_PER_DAY`
 *   during translation (PR #B3 Task 5).
 * - `pdf-translation-watermark` — Free user clicked the bottom-right
 *   watermark after seeing ≥1 translated page (M3 PR#C Task 4).
 */
export type PdfUpgradeDialogSource
  = | "pdf-translation-daily-limit"
    | "pdf-translation-watermark"

/**
 * Combined open-state + source for the PDF-translation UpgradeDialog.
 *
 * Task 4 split the previous boolean into `{ open, source }` so we can preserve
 * attribution across the two upsell entry points (daily-limit vs. watermark)
 * that both drive the same dialog instance.
 */
export interface PdfUpgradeDialogState {
  open: boolean
  source: PdfUpgradeDialogSource
}

/**
 * Controls visibility + analytics source of the PDF-translation UpgradeDialog.
 *
 * Default: `{ open: false, source: "pdf-translation-daily-limit" }` — the
 * dialog is mounted but invisible until a trigger fires. Each caller opens
 * the dialog by writing `{ open: true, source: <their-tag> }` so the user's
 * journey through the pricing flow can be attributed correctly.
 *
 * Callers:
 *   - main.ts — writes `open: true, source: "pdf-translation-daily-limit"`
 *     when the 50th fresh page lands and the Free cap is reached.
 *   - watermark.tsx — writes `open: true, source: "pdf-translation-watermark"`
 *     on watermark click.
 *
 * The dialog's own `onOpenChange` callback flips `open` back to `false` when
 * the user closes the dialog; `source` is preserved for the next trigger
 * (it's re-set on every open).
 */
export const showPdfUpgradeDialogAtom = atom<PdfUpgradeDialogState>({
  open: false,
  source: "pdf-translation-daily-limit",
})

/**
 * Sticky "the user has seen ≥1 page translated in this viewer session" flag
 * (M3 PR#C Task 4). Once flipped `true`, never flips back — the watermark
 * should stay visible for the rest of the session even if later pages fail.
 *
 * Flipped in main.ts's coordinator `onPageSuccess` hook (first fresh-page
 * success). Reset implicitly on viewer reload (new atom store instance per
 * boot).
 *
 * Reason we need this: a blank viewer pre-translation shouldn't show
 * "Translated by GetU" — that'd be false advertising. Once the user has
 * seen at least one translated paragraph, the watermark is honest + fair
 * for the upsell prompt.
 */
export const hasAnyTranslatedPageAtom = atom<boolean>(false)
