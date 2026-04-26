import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SiteShell } from "@/app/components"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { getMessages } from "@/lib/i18n/messages"
import { absoluteLocaleUrl, languageAlternates } from "@/lib/i18n/routing"
import { TranslateClient } from "./translate-client"
import "./styles.css"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) return {}
  const t = getMessages(rawLocale).translate
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: {
      canonical: absoluteLocaleUrl(rawLocale, "/translate"),
      languages: languageAlternates("/translate"),
    },
  }
}

export default async function TranslatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const t = getMessages(locale)

  // NOTE: do NOT shape `messages` with functions here — page.tsx is a Server
  // Component (no 'use client'), so React Server Components cannot serialize
  // closures across the server→client boundary. Pass the raw i18n template
  // strings and let the client format them.
  return (
    <SiteShell locale={locale} messages={t.common}>
      <TranslateClient locale={locale} messages={t.translate} />
    </SiteShell>
  )
}
