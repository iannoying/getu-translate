import Link from "next/link"
import { SiteShell } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)

  return (
    <SiteShell locale={locale} messages={t.common}>
      <section className="home-hero">
        <div>
          <p className="eyebrow">{t.home.eyebrow}</p>
          <h1>{t.home.title}</h1>
          <p>{t.home.intro}</p>
          <div className="cta-row">
            <Link className="button primary" href={localeHref(locale, "/price")}>{t.home.viewPricing}</Link>
            <Link className="button secondary" href={localeHref(locale, "/privacy")}>{t.home.readPrivacy}</Link>
          </div>
        </div>
        <aside className="product-panel" aria-label={t.home.includesTitle}>
          <h2>{t.home.includesTitle}</h2>
          <ul className="signal-list">
            {t.home.includes.map(item => <li key={item}>{item}</li>)}
          </ul>
        </aside>
      </section>

      <section className="feature-band" aria-label="Product highlights">
        {t.home.highlights.map(item => (
          <div key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </div>
        ))}
      </section>
    </SiteShell>
  )
}
