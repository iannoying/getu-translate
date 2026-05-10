"use client"

import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import { PreviewClient } from "./preview-client"
import { normalizePreviewJobId } from "./preview-routing"
import type { PreviewMessages, ShellLabels, UpgradeLabels } from "./preview-client"

/**
 * Reads `?jobId=` from the URL and renders PreviewClient.
 * Must be "use client" because useSearchParams requires a client component.
 * Wrapped in Suspense by the server page.
 */
export function PreviewClientWrapper({
  locale,
  messages,
  shellLabels,
  upgradeLabels,
}: {
  locale: Locale
  messages: PreviewMessages
  shellLabels: ShellLabels
  upgradeLabels: UpgradeLabels
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawJobId = searchParams?.get("jobId") ?? ""
  const jobId = normalizePreviewJobId(rawJobId)

  useEffect(() => {
    if (!jobId) {
      router.replace(localeHref(locale, "/document"))
      return
    }
    if (rawJobId !== jobId) {
      router.replace(localeHref(locale, `/document/preview?jobId=${encodeURIComponent(jobId)}`))
    }
  }, [jobId, rawJobId, locale, router])

  if (!jobId) return null

  return (
    <PreviewClient
      key={jobId}
      jobId={jobId}
      locale={locale}
      messages={messages}
      shellLabels={shellLabels}
      upgradeLabels={upgradeLabels}
    />
  )
}
