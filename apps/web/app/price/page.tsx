import Link from "next/link"
import { PageHero, SiteShell } from "../components"
import { UpgradeButton } from "./UpgradeButton"

export const metadata = {
  title: "Pricing | GetU Translate",
  description: "Pricing for GetU Translate, an AI-powered browser translation extension.",
}

export default function PricePage() {
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
          <p className="price">$8</p>
          <p className="price-note">per month, or $72 per year when billed annually.</p>
          <ul className="feature-list">
            <li>Higher translation usage limits</li>
            <li>Advanced article and subtitle translation support</li>
            <li>Priority access to new AI reading features</li>
            <li>Email support for billing and account issues</li>
          </ul>
          <div className="cta-row">
            <UpgradeButton plan="pro_monthly" />
          </div>
        </article>
      </section>

      <section className="billing-note">
        <strong>Billing terms</strong>
        <p>
          Prices are listed in USD and taxes may apply based on your location. Payments, invoices, renewals, and subscription management are securely handled by Paddle as merchant of record. By purchasing, you agree to our{" "}
          <Link href="/terms-and-conditions">Terms of Service</Link>,{" "}
          <Link href="/privacy">Privacy Policy</Link>, and{" "}
          <Link href="/refund">Refund Policy</Link>.
        </p>
      </section>
    </SiteShell>
  )
}
