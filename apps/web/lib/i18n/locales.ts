export const SUPPORTED_LOCALES = ["en", "zh-CN", "zh-TW"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_STORAGE_KEY = "getu:web-locale"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
}

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: "en",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
}

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function detectLocaleFromLanguages(languages: readonly string[] | undefined): Locale {
  for (const raw of languages ?? []) {
    const normalized = raw.toLowerCase()
    if (
      normalized === "zh-tw" ||
      normalized === "zh-hk" ||
      normalized === "zh-mo" ||
      normalized.startsWith("zh-hant")
    ) {
      return "zh-TW"
    }
    if (
      normalized === "zh" ||
      normalized === "zh-cn" ||
      normalized === "zh-sg" ||
      normalized.startsWith("zh-hans")
    ) {
      return "zh-CN"
    }
    if (normalized.startsWith("en")) {
      return "en"
    }
  }
  return DEFAULT_LOCALE
}

export function getRootRedirectLocale(
  storedLocale: string | null | undefined,
  languages: readonly string[] | undefined,
): Locale {
  if (isSupportedLocale(storedLocale)) {
    return storedLocale
  }
  return detectLocaleFromLanguages(languages)
}
