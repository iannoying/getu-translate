import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { SiteShell } from "@/app/components"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { getMessages } from "@/lib/i18n/messages"
import { absoluteLocaleUrl, languageAlternates } from "@/lib/i18n/routing"
import { PreviewClientWrapper } from "./preview-client-wrapper"
import "../../translate/styles.css"
import "../styles.css"

/**
 * /document/preview?jobId=<id> — PDF translation preview page (M6.11).
 *
 * Uses query-param routing (not [jobId] segment) because apps/web is
 * `output: "export"` — dynamic segments require generateStaticParams which
 * cannot enumerate job IDs.  The client reads `?jobId=` via useSearchParams.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) return {}
  const t = getMessages(rawLocale).document
  return {
    title: t.preview.metaTitle,
    description: t.metaDescription,
    alternates: {
      canonical: absoluteLocaleUrl(rawLocale, "/document/preview"),
      languages: languageAlternates("/document/preview"),
    },
  }
}

export default async function DocumentPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  if (!isSupportedLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const t = getMessages(locale)

  return (
    <SiteShell locale={locale} messages={t.common}>
      {/* Suspense required: PreviewClientWrapper calls useSearchParams. */}
      <Suspense fallback={null}>
        <PreviewClientWrapper
          locale={locale}
          messages={t.document.preview}
          shellLabels={t.translate.shell}
        />
      </Suspense>
    </SiteShell>
  )
}
