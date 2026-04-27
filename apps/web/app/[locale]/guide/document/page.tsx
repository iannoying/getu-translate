import type { Metadata } from "next"
import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales"
import { getMessages } from "@/lib/i18n/messages"
import { absoluteLocaleUrl, languageAlternates } from "@/lib/i18n/routing"
import { SiteShell } from "@/app/components"
import ZhCN from "./_content/zh-CN.mdx"
import ZhTW from "./_content/zh-TW.mdx"
import En from "./_content/en.mdx"
import "../translate/styles.css"
// Note: styles.css lives in guide/translate/ and is shared by guide/document/

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map(locale => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const titles: Record<Locale, string> = {
    en: "PDF Document Translation Guide · GetU Translate",
    "zh-CN": "PDF 文档翻译说明 · GetU Translate",
    "zh-TW": "PDF 文件翻譯說明 · GetU Translate",
  }
  const descs: Record<Locale, string> = {
    en: "How to translate PDF documents with GetU Translate — limits, output formats, and FAQ.",
    "zh-CN": "了解 GetU Translate PDF 文档翻译功能的处理流程、文件限制和常见问题。",
    "zh-TW": "了解 GetU Translate PDF 文件翻譯功能的處理流程、文件限制與常見問題。",
  }
  return {
    title: titles[locale],
    description: descs[locale],
    alternates: {
      canonical: absoluteLocaleUrl(locale, "/guide/document"),
      languages: languageAlternates("/guide/document"),
    },
  }
}

export default async function GuideDocumentPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  const Content = locale === "zh-TW" ? ZhTW : locale === "zh-CN" ? ZhCN : En
  return (
    <SiteShell locale={locale} messages={t.common}>
      <main className="guide-doc-page">
        <Content />
      </main>
    </SiteShell>
  )
}
