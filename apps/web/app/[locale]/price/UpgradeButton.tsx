"use client"

import { useEffect, useState } from "react"
import { orpcClient } from "@/lib/orpc-client"
import type { Locale } from "@/lib/i18n/locales"
import type { Messages } from "@/lib/i18n/messages"

const SITE_ORIGIN = "https://getutranslate.com"

export function UpgradeButton({
  locale,
  plan,
  provider,
  mode = "subscription",
  label,
  priceMessages,
  errors,
}: {
  locale: Locale
  plan: "pro_monthly" | "pro_yearly"
  provider: "paddle" | "stripe"
  mode?: "subscription" | "one_time"
  label: string
  priceMessages: Messages["price"]
  errors: Messages["errors"]
}) {
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    orpcClient.billing.getEntitlements({})
      .then(ent => setEnabled(ent.billingEnabled))
      .catch(() => setEnabled(false))
  }, [])

  async function onClick() {
    setLoading(true)
    setError(null)

    try {
      const { url } = await orpcClient.billing.createCheckoutSession({
        plan,
        provider,
        mode,
        successUrl: `${SITE_ORIGIN}/${locale}/upgrade/success/`,
        cancelUrl: `${SITE_ORIGIN}/${locale}/price/`,
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.checkoutFailed)
      setLoading(false)
    }
  }

  if (!enabled) {
    return <button className="button primary" disabled>{priceMessages.comingSoon}</button>
  }

  return (
    <>
      <button className="button primary" onClick={onClick} disabled={loading}>
        {loading ? priceMessages.loading : label}
      </button>
      {error && <p className="price-note">{error}</p>}
    </>
  )
}
