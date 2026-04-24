import type { UILocale } from "./locales"
import { DEFAULT_UI_LOCALE } from "./locales"

const EXACT_FALLBACK_MAP: Record<string, UILocale> = {
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
  "zh-tw": "zh-TW",
  "zh-hant": "zh-TW",
  "zh-hant-hk": "zh-TW",
  "zh-hant-tw": "zh-TW",
  "zh-cn": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-hans-cn": "zh-CN",
  "zh-hans-sg": "zh-CN",
  "zh": "zh-CN",
}

const PRIMARY_LANGUAGE_TO_LOCALE: Record<string, UILocale> = {
  en: "en",
  ja: "ja",
  ko: "ko",
  ru: "ru",
  tr: "tr",
  vi: "vi",
}

/**
 * Normalise a BCP-47 tag to our supported UI locale.
 *
 * Rules:
 *   1. Exact (case-insensitive) match against known aliases (e.g. zh-HK → zh-TW).
 *   2. Primary language subtag match (e.g. ja-JP → ja).
 *   3. Fallback to default (en).
 */
// Case-normalised lookup of exact supported tags, so `EN`, `zh-cn`, and `ZH-CN`
// all map to their canonical `UILocale` form regardless of input casing.
const CANONICAL_BY_LOWER: Record<string, UILocale> = {
  "en": "en",
  "zh-cn": "zh-CN",
  "zh-tw": "zh-TW",
  "ja": "ja",
  "ko": "ko",
  "ru": "ru",
  "tr": "tr",
  "vi": "vi",
}

export function normaliseLocaleTag(tag: string | null | undefined): UILocale {
  if (!tag)
    return DEFAULT_UI_LOCALE
  const lower = tag.toLowerCase().replace(/_/g, "-")
  if (EXACT_FALLBACK_MAP[lower])
    return EXACT_FALLBACK_MAP[lower]
  if (CANONICAL_BY_LOWER[lower])
    return CANONICAL_BY_LOWER[lower]
  const primary = lower.split("-")[0]
  if (PRIMARY_LANGUAGE_TO_LOCALE[primary])
    return PRIMARY_LANGUAGE_TO_LOCALE[primary]
  return DEFAULT_UI_LOCALE
}

function readBrowserI18nLocale(): string | undefined {
  try {
    // Prefer WebExtension i18n API (reflects the browser UI language).
    const bi = (globalThis as any).browser?.i18n ?? (globalThis as any).chrome?.i18n
    if (bi && typeof bi.getUILanguage === "function") {
      const tag = bi.getUILanguage()
      if (typeof tag === "string" && tag.length > 0)
        return tag
    }
  }
  catch {
    // Ignore; not available in non-extension contexts (e.g. tests).
  }
  return undefined
}

function readNavigatorLocale(): string | undefined {
  try {
    if (typeof navigator !== "undefined") {
      if (Array.isArray(navigator.languages) && navigator.languages.length > 0)
        return navigator.languages[0]
      if (typeof navigator.language === "string" && navigator.language.length > 0)
        return navigator.language
    }
  }
  catch {
    // No-op.
  }
  return undefined
}

/**
 * Detect the best UI locale from the current environment. Used when the user
 * preference is "auto" or when no preference is stored yet.
 *
 * Priority: browser.i18n.getUILanguage() → navigator.languages/language → en.
 */
export function detectBrowserUILocale(): UILocale {
  return normaliseLocaleTag(readBrowserI18nLocale() ?? readNavigatorLocale())
}
