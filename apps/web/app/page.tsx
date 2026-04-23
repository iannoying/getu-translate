"use client"

import Link from "next/link"
import { useEffect } from "react"
import { getRootRedirectLocale, LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"

export default function RootLocaleRedirectPage() {
  useEffect(() => {
    let stored: string | null = null

    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    } catch {
      stored = null
    }

    const locale = getRootRedirectLocale(stored, window.navigator.languages)
    window.location.replace(localeHref(locale, "/"))
  }, [])

  return (
    <main className="root-locale-page">
      <h1>GetU Translate</h1>
      <nav aria-label="Choose language">
        {SUPPORTED_LOCALES.map(locale => (
          <Link key={locale} className="button secondary" href={localeHref(locale, "/")}>
            {LOCALE_LABELS[locale]}
          </Link>
        ))}
      </nav>
    </main>
  )
}
