"use client"

import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import { PreviewClient } from "./preview-client"
import type { PreviewMessages, ShellLabels } from "./preview-client"

/**
 * Reads `?jobId=` from the URL and renders PreviewClient.
 * Must be "use client" because useSearchParams requires a client component.
 * Wrapped in Suspense by the server page.
 */
export function PreviewClientWrapper({
  locale,
  messages,
  shellLabels,
}: {
  locale: Locale
  messages: PreviewMessages
  shellLabels: ShellLabels
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = searchParams?.get("jobId") ?? ""

  useEffect(() => {
    if (!jobId) {
      router.replace(localeHref(locale, "/document"))
    }
  }, [jobId, locale, router])

  if (!jobId) return null

  return (
    <PreviewClient
      jobId={jobId}
      locale={locale}
      messages={messages}
      shellLabels={shellLabels}
    />
  )
}
