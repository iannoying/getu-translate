import { browser } from "#imports"
import { useCallback, useState } from "react"
import { orpcClient } from "@/utils/orpc/client"

type Plan = "pro_monthly" | "pro_yearly"
type Currency = "usd" | "cny"

export function useCheckout() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const startCheckout = useCallback(async ({ plan, currency = "usd" }: { plan: Plan, currency?: Currency }) => {
    setIsLoading(true)
    setError(null)
    try {
      const successUrl = browser.runtime.getURL("/upgrade-success.html")
      const cancelUrl = `${successUrl}?cancelled=1`
      const { url } = await orpcClient.billing.createCheckoutSession({
        plan,
        provider: "stripe",
        currency,
        successUrl,
        cancelUrl,
      })
      await browser.tabs.create({ url })
    }
    catch (err) {
      setError(err as Error)
      throw err
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  return { startCheckout, isLoading, error }
}
