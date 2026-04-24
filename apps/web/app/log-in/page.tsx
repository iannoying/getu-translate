"use client"

import Link from "next/link"
import { useEffect } from "react"
import { getRootRedirectLocale, LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"

export default function LogInRootRedirectPage() {
  useEffect(() => {
    let stored: string | null = null

    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    } catch {
      stored = null
    }

    const locale = getRootRedirectLocale(stored, window.navigator.languages)
    const search = window.location.search
    window.location.replace(`${localeHref(locale, "/log-in")}${search}`)
  }, [])

  return (
    <main className="root-locale-page">
      <h1>GetU Translate</h1>
      <nav aria-label="Choose language">
        {SUPPORTED_LOCALES.map(locale => (
          <Link key={locale} className="button secondary" href={localeHref(locale, "/log-in")}>
            {LOCALE_LABELS[locale]}
          </Link>
        ))}
      </nav>
    </main>
  )
}
