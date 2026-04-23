"use client"
import Link from "next/link"
import { useState } from "react"
import { PageHero, SiteShell } from "../components"
import { UpgradeButton } from "./UpgradeButton"

export default function PricePage() {
  const [plan, setPlan] = useState<"pro_monthly" | "pro_yearly">("pro_monthly")

  return (
    <SiteShell>
      <PageHero eyebrow="Pricing" title="Simple plans for browser translation">
        <p>
          Start with the free browser extension, then upgrade when you need higher usage limits and advanced AI translation workflows.
        </p>
      </PageHero>

      <section className="pricing-grid" aria-label="Pricing plans">
        <article className="price-card">
          <h2>Free</h2>
          <p className="price">$0</p>
          <p className="price-note">For trying GetU Translate and basic language-learning workflows.</p>
          <ul className="feature-list">
            <li>Web page and selected-text translation</li>
            <li>Basic bilingual reading tools</li>
            <li>Bring-your-own AI provider configuration</li>
          </ul>
        </article>

        <article className="price-card highlight">
          <h2>GetU Pro</h2>
          <p className="price">{plan === "pro_monthly" ? "$8/mo" : "$72/yr"}</p>
          <p className="price-note">per month, or $72 per year when billed annually.</p>
          <ul className="feature-list">
            <li>Higher translation usage limits</li>
            <li>Advanced article and subtitle translation support</li>
            <li>Priority access to new AI reading features</li>
            <li>Email support for billing and account issues</li>
          </ul>

          <div className="plan-toggle">
            <button
              className={`toggle-btn${plan === "pro_monthly" ? " active" : ""}`}
              onClick={() => setPlan("pro_monthly")}
            >
              Monthly
            </button>
            <button
              className={`toggle-btn${plan === "pro_yearly" ? " active" : ""}`}
              onClick={() => setPlan("pro_yearly")}
            >
              Yearly
            </button>
          </div>

          <div className="checkout-options">
            <UpgradeButton plan={plan} provider="stripe" mode="subscription" label="Subscribe (auto-renew)" />
            <UpgradeButton plan={plan} provider="stripe" mode="one_time" label={`Pay once (${plan === "pro_monthly" ? "30 days" : "1 year"})`} />
            <p className="price-note">订阅自动续费；一次性付款到期需重新购买</p>
          </div>
        </article>
      </section>

      <section className="billing-note">
        <strong>Billing terms</strong>
        <p>
          Prices are listed in USD and taxes may apply based on your location. Payments, invoices, renewals, and subscription management are securely handled by Stripe. By purchasing, you agree to our{" "}
          <Link href="/terms-and-conditions">Terms of Service</Link>,{" "}
          <Link href="/privacy">Privacy Policy</Link>, and{" "}
          <Link href="/refund">Refund Policy</Link>.
        </p>
      </section>
    </SiteShell>
  )
}
