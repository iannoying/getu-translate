"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales"
import { localeHref, switchLocalePath } from "@/lib/i18n/routing"
import type { Messages, PolicySectionMessage } from "@/lib/i18n/messages"

export function SiteShell({
  children,
  locale = "en",
  messages = DEFAULT_COMMON_MESSAGES,
}: {
  children: React.ReactNode
  locale?: Locale
  messages?: Messages["common"]
}) {
  const footerLinks = [
    { href: localeHref(locale, "/price"), label: messages.nav.pricing },
    { href: localeHref(locale, "/terms-and-conditions"), label: messages.nav.terms },
    { href: localeHref(locale, "/privacy"), label: messages.nav.privacy },
    { href: localeHref(locale, "/refund"), label: messages.nav.refunds },
  ]
  const topNavLinks = [
    ...footerLinks,
    { href: localeHref(locale, "/log-in"), label: messages.nav.logIn },
  ]

  return (
    <main className="site-shell">
      <header className="site-header" aria-label="Main navigation">
        <Link className="brand" href={localeHref(locale, "/")}>
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>{messages.brand}</span>
        </Link>
        <nav className="top-nav">
          {topNavLinks.map(link => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
          <LanguageSwitcher locale={locale} label={messages.languageLabel} />
        </nav>
      </header>

      {children}

      <footer className="site-footer">
        <div>
          <strong>{messages.brand}</strong>
          <p>{messages.footerDescription}</p>
        </div>
        <nav aria-label="Legal links">
          {footerLinks.map(link => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
      </footer>
    </main>
  )
}

function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname()

  function onChange(nextLocale: Locale) {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    } catch {
      // Browsers may block storage; URL switch still works.
    }
    window.location.href = switchLocalePath(pathname ?? "/", nextLocale)
  }

  return (
    <label className="language-switcher">
      <span className="sr-only">{label}</span>
      <select
        value={locale}
        aria-label={label}
        onChange={event => onChange(event.target.value as Locale)}
      >
        {SUPPORTED_LOCALES.map(option => (
          <option key={option} value={option}>{LOCALE_LABELS[option]}</option>
        ))}
      </select>
    </label>
  )
}

export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="page-hero">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="hero-copy">{children}</div>
    </section>
  )
}

export function PolicyPage({
  locale = "en",
  common = DEFAULT_COMMON_MESSAGES,
  legal = DEFAULT_LEGAL_MESSAGES,
  title,
  description,
  children,
  sections,
}: {
  locale?: Locale
  common?: Messages["common"]
  legal?: Messages["legal"]
  title: string
  description: string
  children?: React.ReactNode
  sections?: PolicySectionMessage[]
}) {
  return (
    <SiteShell locale={locale} messages={common}>
      <PageHero eyebrow={legal.eyebrow} title={title}>
        <p>{description}</p>
        <p className="muted">{legal.effectiveDate}</p>
        {legal.translationDisclaimer && <p className="muted">{legal.translationDisclaimer}</p>}
      </PageHero>
      <article className="policy-body">
        {sections != null
          ? sections.map(section => (
              <PolicySection key={section.title} title={section.title}>
                {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {section.list && (
                  <ul>
                    {section.list.map(item => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </PolicySection>
            ))
          : children}
      </article>
    </SiteShell>
  )
}

const DEFAULT_COMMON_MESSAGES: Messages["common"] = {
  brand: "GetU Translate",
  nav: {
    pricing: "Pricing",
    terms: "Terms",
    privacy: "Privacy",
    refunds: "Refunds",
    logIn: "Log in",
  },
  footerDescription: "AI translation tools for web pages, selected text, subtitles, and articles.",
  languageLabel: "Language",
}

const DEFAULT_LEGAL_MESSAGES: Messages["legal"] = {
  eyebrow: "Legal",
  effectiveDate: "Effective date: April 22, 2026",
  translationDisclaimer: "",
}

export function PolicySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
