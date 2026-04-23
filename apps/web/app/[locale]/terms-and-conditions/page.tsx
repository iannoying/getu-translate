import type { Metadata } from "next"
import { PolicyPage } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return {
    title: `${t.terms.title} | GetU Translate`,
    description: t.terms.description,
  }
}

export default async function TermsAndConditionsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return (
    <PolicyPage
      locale={locale}
      common={t.common}
      legal={t.legal}
      title={t.terms.title}
      description={t.terms.description}
      sections={t.terms.sections}
    />
  )
}
