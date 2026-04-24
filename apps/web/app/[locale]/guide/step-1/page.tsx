import type { Metadata } from "next"
import Link from "next/link"
import { SiteShell } from "@/app/components"
import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales"
import { getMessages } from "@/lib/i18n/messages"
import { absoluteLocaleUrl, languageAlternates, localeHref } from "@/lib/i18n/routing"

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map(locale => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return {
    title: `${t.guide.step1Title} | GetU Translate`,
    description: t.guide.step1Intro,
    alternates: {
      canonical: absoluteLocaleUrl(locale, "/guide/step-1"),
      languages: languageAlternates("/guide/step-1"),
    },
  }
}

export default async function GuideStep1Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return (
    <SiteShell locale={locale} messages={t.common}>
      <section className="guide-page">
        <div className="guide-card">
          <p className="eyebrow">
            {t.guide.eyebrow} · {t.guide.stepLabel}
          </p>
          <h1>
            <span className="guide-wave" aria-hidden="true">👋</span>
            {t.guide.step1Title}
          </h1>
          <p className="guide-intro">{t.guide.step1Intro}</p>

          <section className="guide-section">
            <h2>{t.guide.pinTitle}</h2>
            <ol className="guide-steps">
              {t.guide.pinSteps.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="guide-section">
            <h2>{t.guide.tryTitle}</h2>
            <p>{t.guide.tryBody}</p>
          </section>

          <div className="cta-row">
            <Link className="button primary" href={localeHref(locale, "/")}>
              {t.guide.openHome}
            </Link>
            <Link className="button secondary" href={localeHref(locale, "/price")}>
              {t.guide.openPricing}
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  )
}
