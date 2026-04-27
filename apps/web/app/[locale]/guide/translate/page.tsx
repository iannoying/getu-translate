import type { Metadata } from "next"
import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales"
import { getMessages } from "@/lib/i18n/messages"
import { absoluteLocaleUrl, languageAlternates } from "@/lib/i18n/routing"
import { SiteShell } from "@/app/components"
import ZhCN from "./_content/zh-CN.mdx"
import ZhTW from "./_content/zh-TW.mdx"
import En from "./_content/en.mdx"
import "./styles.css"
// styles.css is also imported by guide/document/page.tsx

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
    en: "Text Translation Guide · GetU Translate",
    "zh-CN": "网页文本翻译说明 · GetU Translate",
    "zh-TW": "網頁文字翻譯說明 · GetU Translate",
  }
  const descs: Record<Locale, string> = {
    en: "How to use GetU Translate's text translation — models, quotas, and tips.",
    "zh-CN": "了解 GetU Translate 文本翻译功能的使用方法、可用模型和配额规则。",
    "zh-TW": "了解 GetU Translate 文字翻譯功能的使用方式、可用模型與配額規則。",
  }
  return {
    title: titles[locale],
    description: descs[locale],
    alternates: {
      canonical: absoluteLocaleUrl(locale, "/guide/translate"),
      languages: languageAlternates("/guide/translate"),
    },
  }
}

export default async function GuideTranslatePage({
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
