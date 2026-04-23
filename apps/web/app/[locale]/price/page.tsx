import type { Metadata } from "next"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { absoluteLocaleUrl, languageAlternates } from "@/lib/i18n/routing"
import { PricePageClient } from "./PricePageClient"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return {
    title: `${t.price.title} | GetU Translate`,
    description: t.price.intro,
    alternates: {
      canonical: absoluteLocaleUrl(locale, "/price"),
      languages: languageAlternates("/price"),
    },
  }
}

export default async function PricePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"

  return <PricePageClient locale={locale} />
}
