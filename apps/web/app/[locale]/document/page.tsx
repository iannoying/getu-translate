import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { SiteShell } from "@/app/components"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"
import { getMessages } from "@/lib/i18n/messages"
import { absoluteLocaleUrl, languageAlternates } from "@/lib/i18n/routing"
import { DocumentClient } from "./document-client"
import "../translate/styles.css"
import "./styles.css"

/**
 * /document — PDF translation upload UI (M6.8).
 *
 * Server component shell that resolves the locale + i18n strings and hands
 * off to a client island (`DocumentClient`). The `?src=...` integration
 * (extension PR #181) is parsed *client-side* via `useSearchParams` because
 * apps/web is configured for `output: "export"` — reading searchParams in
 * a server component would force dynamic rendering and break the static
 * export.
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
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: {
      canonical: absoluteLocaleUrl(rawLocale, "/document"),
      languages: languageAlternates("/document"),
    },
  }
}

export default async function DocumentPage({
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
      {/* Suspense required because DocumentClient calls useSearchParams,
          which forces a client-side render bailout under static export. */}
      <Suspense fallback={null}>
        <DocumentClient
          locale={locale}
          messages={t.document}
          shellLabels={t.translate.shell}
          upgradeLabels={t.translate.upgradeModal}
          quotaLabels={{
            label: t.translate.page.quotaLabel,
            tooltip: t.translate.quotaBadge.tooltip,
          }}
        />
      </Suspense>
    </SiteShell>
  )
}
