"use client"
import { useEffect, useState } from "react"
import { orpcClient } from "@/lib/orpc-client"
import { SiteShell, PageHero } from "../../components"

type PollState = "polling" | "done" | "timeout"

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 30_000

export default function UpgradeSuccessPage() {
  const [state, setState] = useState<PollState>("polling")

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()

    async function poll() {
      while (!cancelled) {
        try {
          const ent = await orpcClient.billing.getEntitlements({})
          if (ent.tier !== "free") {
            if (!cancelled) setState("done")
            return
          }
        } catch {
          // ignore transient errors, keep polling
        }

        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          if (!cancelled) setState("timeout")
          return
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    poll()
    return () => { cancelled = true }
  }, [])

  return (
    <SiteShell>
      <PageHero eyebrow="Upgrade" title="Thank you for upgrading!">
        {state === "polling" && (
          <p>Confirming your subscription\u2026 this usually takes a few seconds.</p>
        )}
        {state === "done" && (
          <p>
            Your Pro subscription is active. Head back to the extension and enjoy the full GetU Translate experience.
          </p>
        )}
        {state === "timeout" && (
          <p>
            We could not confirm your subscription yet. It may take a minute to process \u2014 please refresh or{" "}
            <a href="/price">return to pricing</a> if the issue persists.
          </p>
        )}
      </PageHero>
    </SiteShell>
  )
}
