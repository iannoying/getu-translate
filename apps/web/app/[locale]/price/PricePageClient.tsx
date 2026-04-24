"use client"

import Link from "next/link"
import { useState } from "react"
import { PageHero, SiteShell } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { type Locale } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"
import { UpgradeButton } from "./UpgradeButton"

const CNY_LOCALES = new Set(["zh-CN", "zh-TW"])

export function PricePageClient({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const [plan, setPlan] = useState<"pro_monthly" | "pro_yearly">("pro_monthly")

  const isCny = CNY_LOCALES.has(locale)
  const currency = isCny ? "cny" as const : "usd" as const

  const displayMonthlyPrice = isCny ? t.price.cnyMonthlyPrice : t.price.monthlyPrice
  const displayYearlyPrice = isCny ? t.price.cnyYearlyPrice : t.price.yearlyPrice
  const ctaLabel = isCny ? t.price.buyOnce : t.price.subscribe
  const billingNote = isCny ? t.price.billingNoteCny : t.price.billingNoteUsd

  return (
    <SiteShell locale={locale} messages={t.common}>
      <PageHero eyebrow={t.price.eyebrow} title={t.price.title}>
        <p>{t.price.intro}</p>
      </PageHero>

      <section className="pricing-grid" aria-label={t.price.plansLabel}>
        <article className="price-card">
          <h2>{t.price.freeTitle}</h2>
          <p className="price">{t.price.freePrice}</p>
          <p className="price-note">{t.price.freeNote}</p>
          <ul className="feature-list">
            {t.price.freeFeatures.map(feature => <li key={feature}>{feature}</li>)}
          </ul>
        </article>

        <article className="price-card highlight">
          <h2>{t.price.proTitle}</h2>
          <p className="price">{plan === "pro_monthly" ? displayMonthlyPrice : displayYearlyPrice}</p>
          <p className="price-note">{t.price.proNote}</p>
          <ul className="feature-list">
            {t.price.proFeatures.map(feature => <li key={feature}>{feature}</li>)}
          </ul>

          <div className="plan-toggle">
            <button
              className={`toggle-btn${plan === "pro_monthly" ? " active" : ""}`}
              onClick={() => setPlan("pro_monthly")}
            >
              {t.price.monthly}
            </button>
            <button
              className={`toggle-btn${plan === "pro_yearly" ? " active" : ""}`}
              onClick={() => setPlan("pro_yearly")}
            >
              {t.price.yearly}
            </button>
          </div>

          <div className="checkout-options">
            <UpgradeButton
              locale={locale}
              plan={plan}
              provider="stripe"
              currency={currency}
              label={ctaLabel}
              priceMessages={t.price}
              errors={t.errors}
            />
            <p className="price-note">{billingNote}</p>
          </div>
        </article>
      </section>

      <section className="billing-note">
        <strong>{t.price.billingTitle}</strong>
        <p>
          {t.price.billingBody} {t.price.billingAgreementPrefix}{" "}
          <Link href={localeHref(locale, "/terms-and-conditions")}>{t.common.nav.terms}</Link>,{" "}
          <Link href={localeHref(locale, "/privacy")}>{t.common.nav.privacy}</Link>, and{" "}
          <Link href={localeHref(locale, "/refund")}>{t.common.nav.refunds}</Link>.
        </p>
      </section>
    </SiteShell>
  )
}
