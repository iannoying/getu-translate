import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, LOCALE_HTML_LANG, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales"

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map(locale => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) {
    return {}
  }

  const t = getMessages(rawLocale)
  return {
    title: t.meta.siteTitle,
    description: t.meta.siteDescription,
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) {
    notFound()
  }

  const locale: Locale = rawLocale
  return <div lang={LOCALE_HTML_LANG[locale]}>{children}</div>
}
