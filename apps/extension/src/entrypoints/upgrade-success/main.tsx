import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { orpcClient } from "@/utils/orpc/client"
import "@/assets/styles/theme.css"

type Status = "polling" | "done" | "timeout" | "cancelled"

function UpgradeSuccess() {
  const params = new URLSearchParams(location.search)
  const cancelled = params.get("cancelled") === "1"
  const [status, setStatus] = useState<Status>(cancelled ? "cancelled" : "polling")

  useEffect(() => {
    if (cancelled)
      return

    let attempts = 0
    const t = setInterval(async () => {
      attempts++
      try {
        const ent = await orpcClient.billing.getEntitlements({})
        if (ent.tier === "pro") {
          setStatus("done")
          clearInterval(t)
          const closeTimer = setTimeout(() => window.close(), 3000)
          return closeTimer
        }
      }
      catch {
        // keep polling
      }
      if (attempts >= 10) {
        setStatus("timeout")
        clearInterval(t)
      }
    }, 3000)

    return () => clearInterval(t)
  }, [cancelled])

  if (status === "cancelled") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl font-semibold">Upgrade cancelled</p>
        <p className="text-muted-foreground">You can upgrade anytime from the Account settings.</p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => window.close()}
        >
          Close
        </button>
      </div>
    )
  }

  if (status === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl font-semibold text-green-600">You&apos;re now on Pro!</p>
        <p className="text-muted-foreground">This window will close automatically in a few seconds.</p>
      </div>
    )
  }

  if (status === "timeout") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl font-semibold">Taking longer than expected</p>
        <p className="text-muted-foreground">Your payment was received — it may take a moment to activate. Reload the extension to check.</p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => window.close()}
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-lg font-medium">Activating your Pro subscription&hellip;</p>
      <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<UpgradeSuccess />)
