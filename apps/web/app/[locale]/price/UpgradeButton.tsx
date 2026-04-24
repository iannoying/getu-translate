"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { orpcClient } from "@/lib/orpc-client"
import { authClient } from "@/lib/auth-client"
import type { Locale } from "@/lib/i18n/locales"
import type { Messages } from "@/lib/i18n/messages"
import { SITE_ORIGIN } from "@/lib/i18n/routing"

export function UpgradeButton({
  locale,
  plan,
  provider,
  currency = "usd",
  label,
  priceMessages,
  errors,
}: {
  locale: Locale
  plan: "pro_monthly" | "pro_yearly"
  provider: "paddle" | "stripe"
  currency?: "usd" | "cny"
  label: string
  priceMessages: Messages["price"]
  errors: Messages["errors"]
}) {
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: session, isPending: sessionLoading } = authClient.useSession()
  const pathname = usePathname()

  useEffect(() => {
    if (!session) return
    orpcClient.billing.getEntitlements({})
      .then(ent => setEnabled(ent.billingEnabled))
      .catch(() => setEnabled(false))
  }, [session])

  async function onClick() {
    setLoading(true)
    setError(null)

    try {
      const { url } = await orpcClient.billing.createCheckoutSession({
        plan,
        provider,
        currency,
        successUrl: `${SITE_ORIGIN}/${locale}/upgrade/success/`,
        cancelUrl: `${SITE_ORIGIN}/${locale}/price/`,
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.checkoutFailed)
      setLoading(false)
    }
  }

  if (sessionLoading) {
    return <button className="button primary" disabled>{priceMessages.loading}</button>
  }

  if (!session) {
    const redirectTarget = encodeURIComponent(pathname)
    return (
      <a className="button primary" href={`/${locale}/log-in?redirect=${redirectTarget}`}>
        {priceMessages.loginToSubscribe}
      </a>
    )
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
