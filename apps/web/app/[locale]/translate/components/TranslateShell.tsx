"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"

/**
 * Left vertical nav for /translate and /document. Sits inside the parent
 * SiteShell — header/footer come from there; this only owns the side rail.
 */
export function TranslateShell({
  locale,
  labels,
  children,
}: {
  locale: Locale
  labels: { text: string; document: string; upgradePro: string }
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""
  const items = [
    { href: localeHref(locale, "/translate"), label: labels.text, icon: "T" },
    { href: localeHref(locale, "/document"), label: labels.document, icon: "📄" },
  ]

  return (
    <div className="translate-shell">
      <aside className="translate-sidenav" aria-label="Translate sections">
        <nav>
          {items.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`translate-sidenav-item ${active ? "active" : ""}`}
              >
                <span className="translate-sidenav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="translate-sidenav-foot">
          <Link href={localeHref(locale, "/upgrade")} className="button primary small">
            {labels.upgradePro}
          </Link>
        </div>
      </aside>
      <div className="translate-canvas">{children}</div>
    </div>
  )
}
