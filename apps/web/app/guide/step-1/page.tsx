"use client"

import { useEffect } from "react"
import { getRootRedirectLocale, LOCALE_STORAGE_KEY } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"

export default function GuideStep1RootRedirectPage() {
  useEffect(() => {
    let stored: string | null = null

    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    } catch {
      stored = null
    }

    const locale = getRootRedirectLocale(stored, window.navigator.languages)
    window.location.replace(localeHref(locale, "/guide/step-1"))
  }, [])

  return null
}
