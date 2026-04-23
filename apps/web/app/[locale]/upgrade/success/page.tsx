"use client"

import { use, useEffect, useState } from "react"
import { PageHero, SiteShell } from "@/app/components"
import { orpcClient } from "@/lib/orpc-client"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { localeHref } from "@/lib/i18n/routing"

type PollState = "polling" | "done" | "timeout"

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 30_000

export default function UpgradeSuccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = use(params)
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  const [state, setState] = useState<PollState>("polling")

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()

    async function poll() {
      while (!cancelled) {
        try {
          const ent = await orpcClient.billing.getEntitlements({})
          if (ent.tier !== "free") {
            if (!cancelled) {
              setState("done")
            }
            return
          }
        } catch {
          // Ignore transient errors and continue polling.
        }

        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          if (!cancelled) {
            setState("timeout")
          }
          return
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SiteShell locale={locale} messages={t.common}>
      <PageHero eyebrow={t.upgradeSuccess.eyebrow} title={t.upgradeSuccess.title}>
        {state === "polling" && <p>{t.upgradeSuccess.polling}</p>}
        {state === "done" && <p>{t.upgradeSuccess.done}</p>}
        {state === "timeout" && (
          <p>
            {t.upgradeSuccess.timeoutPrefix}{" "}
            <a href={localeHref(locale, "/price")}>{t.upgradeSuccess.timeoutLink}</a>{" "}
            {t.upgradeSuccess.timeoutSuffix}
          </p>
        )}
      </PageHero>
    </SiteShell>
  )
}
