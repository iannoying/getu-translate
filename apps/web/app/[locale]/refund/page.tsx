import type { Metadata } from "next"
import { PolicyPage } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { absoluteLocaleUrl, languageAlternates } from "@/lib/i18n/routing"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return {
    title: `${t.refund.title} | GetU Translate`,
    description: t.refund.description,
    alternates: {
      canonical: absoluteLocaleUrl(locale, "/refund"),
      languages: languageAlternates("/refund"),
    },
  }
}

export default async function RefundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return (
    <PolicyPage
      locale={locale}
      common={t.common}
      legal={t.legal}
      title={t.refund.title}
      description={t.refund.description}
      sections={t.refund.sections}
    />
  )
}
