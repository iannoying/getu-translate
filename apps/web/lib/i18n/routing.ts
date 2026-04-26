import { type Locale, SUPPORTED_LOCALES } from "./locales"

export const SITE_ORIGIN = "https://getutranslate.com"

const KNOWN_PAGE_PATHS = new Set([
  "",
  "price",
  "log-in",
  "privacy",
  "terms-and-conditions",
  "refund",
  "upgrade/success",
  // M6 — web /translate & /document. Without these, the language switcher
  // sends a user on /<locale>/translate/ back to / instead of preserving
  // the page across locales.
  "translate",
  "document",
])

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, "")
}

function withoutLocale(path: string): string {
  const trimmed = trimSlashes(path)
  const parts = trimmed.split("/").filter(Boolean)

  if (parts.length > 0 && (SUPPORTED_LOCALES as readonly string[]).includes(parts[0])) {
    return parts.slice(1).join("/")
  }

  return trimmed
}

export function localeHref(locale: Locale, path: string): string {
  const inner = trimSlashes(path)
  return inner.length === 0 ? `/${locale}/` : `/${locale}/${inner}/`
}

export function switchLocalePath(currentPath: string, targetLocale: Locale): string {
  const inner = withoutLocale(currentPath)
  if (KNOWN_PAGE_PATHS.has(inner)) {
    return localeHref(targetLocale, inner)
  }
  return localeHref(targetLocale, "/")
}

export function absoluteLocaleUrl(locale: Locale, path: string): string {
  return `${SITE_ORIGIN}${localeHref(locale, path)}`
}

export function languageAlternates(path: string): Record<string, string> {
  return {
    en: absoluteLocaleUrl("en", path),
    "zh-CN": absoluteLocaleUrl("zh-CN", path),
    "zh-TW": absoluteLocaleUrl("zh-TW", path),
  }
}
