"use client"

import type { Locale } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"
import type { Messages } from "@/lib/i18n/messages"
import { useRouter } from "next/navigation"

export type UpgradeModalSource =
  | "free_quota_exceeded"
  | "pro_model_clicked"
  | "pdf_quota_exceeded"
  | "char_limit_exceeded"
  | "history_cleanup_warning"

export interface UpgradeModalLabels {
  titles: Record<UpgradeModalSource, string>
  perks: {
    header: string
    rowRequests: string
    rowModels: string
    rowChars: string
    rowPdf: string
    rowHistory: string
  }
  cta: string
  close: string
}

// Static comparison table data — values are display strings, not i18n keys.
// Free tier vs Pro tier per feature row.
const PERK_ROWS: Array<{ key: keyof UpgradeModalLabels["perks"]; free: string; pro: string }> = [
  { key: "rowRequests", free: "100 / mo",  pro: "2M tokens / mo" },
  { key: "rowModels",   free: "2",          pro: "11" },
  { key: "rowChars",    free: "2,000",      pro: "20,000" },
  { key: "rowPdf",      free: "10 pages",   pro: "500 pages" },
  { key: "rowHistory",  free: "30 days",    pro: "Permanent" },
]

/**
 * Upgrade modal shown when a free user hits a limit or clicks a Pro feature.
 * The `source` discriminator drives the title; everything else is static.
 *
 * Rendered as a native <dialog> element for accessibility (focus trap, Escape
 * key close, and backdrop click-to-close via ::backdrop pseudo-element).
 * No polyfill required — dialog is supported by all evergreen browsers as of
 * Chrome 37 / Firefox 98 / Safari 15.4.
 */
export function UpgradeModal({
  open,
  source,
  onClose,
  locale,
  labels,
}: {
  open: boolean
  source: UpgradeModalSource | null
  onClose: () => void
  locale: Locale
  labels: UpgradeModalLabels
}) {
  const router = useRouter()

  // Sync open state to native <dialog> API via callback ref.
  // We use a callback ref (not useRef + useEffect) so the dialog element is
  // immediately available on first mount without a stale-closure race.
  function dialogRef(el: HTMLDialogElement | null) {
    if (!el) return
    if (open && !el.open) {
      el.showModal()
    } else if (!open && el.open) {
      el.close()
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    // A click on the <dialog> element itself (i.e. the backdrop) closes it.
    // Clicks on child elements bubble up but have a different target.
    if (e.target === e.currentTarget) onClose()
  }

  function handleCtaClick() {
    onClose()
    router.push(localeHref(locale, "/upgrade"))
  }

  if (!open && source === null) return null

  const title = source ? labels.titles[source] : ""

  return (
    <dialog
      ref={dialogRef}
      className="upgrade-modal"
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby="upgrade-modal-title"
    >
      <div className="upgrade-modal-inner">
        <header className="upgrade-modal-header">
          <h2 id="upgrade-modal-title" className="upgrade-modal-title">{title}</h2>
          <button
            type="button"
            className="upgrade-modal-close"
            onClick={onClose}
            aria-label={labels.close}
          >
            ✕
          </button>
        </header>

        <div className="upgrade-modal-body">
          <table className="upgrade-modal-table" aria-label={labels.perks.header}>
            <caption className="upgrade-modal-table-caption">{labels.perks.header}</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Free</th>
                <th scope="col">Pro</th>
              </tr>
            </thead>
            <tbody>
              {PERK_ROWS.map(({ key, free, pro }) => (
                <tr key={key}>
                  <th scope="row">{labels.perks[key]}</th>
                  <td>{free}</td>
                  <td className="upgrade-modal-pro-cell">{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="upgrade-modal-footer">
          <button
            type="button"
            className="button primary"
            onClick={handleCtaClick}
          >
            {labels.cta}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
