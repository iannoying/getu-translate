"use client"
import { useState, useEffect } from "react"
import { orpcClient } from "@/lib/orpc-client"

// Paddle's redirect URL validator only accepts getutranslate.com origins.
// In production this is always correct; in local dev billing returns 412 anyway.
const SITE_ORIGIN = "https://getutranslate.com"

export function UpgradeButton({ plan }: { plan: "pro_monthly" | "pro_yearly" }) {
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
        successUrl: `${SITE_ORIGIN}/upgrade/success`,
        cancelUrl: `${SITE_ORIGIN}/price`,
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed")
      setLoading(false)
    }
  }

  if (!enabled) {
    return <button className="button primary" disabled>Coming soon</button>
  }
  return (
    <>
      <button className="button primary" onClick={onClick} disabled={loading}>
        {loading ? "Loading\u2026" : "Upgrade to Pro"}
      </button>
      {error && <p className="price-note">{error}</p>}
    </>
  )
}
