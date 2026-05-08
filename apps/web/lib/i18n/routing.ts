import { type Locale, SUPPORTED_LOCALES } from "./locales"

export const SITE_ORIGIN = "https://getutranslate.com"

const KNOWN_PAGE_PATHS = new Set([
  "",
  "price",
  "log-in",
  "privacy",
  "terms-and-conditions",
  "refund",
  "settings",
  "upgrade/success",
  // M6 — web /translate & /document. Without these, the language switcher
  // sends a user on /<locale>/translate/ back to / instead of preserving
  // the page across locales.
  "translate",
  "document",
  "document/preview",
  // M6.13 — help/guide pages
  "guide/step-1",
  "guide/translate",
  "guide/document",
])

const LEGACY_PAGE_PATH_ALIASES = new Map<string, string>([
  ["pricing", "price"],
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
  const knownPath = normalizeKnownPagePath(inner)
  if (knownPath != null) {
    return localeHref(targetLocale, knownPath)
  }
  return localeHref(targetLocale, "/")
}

function normalizeKnownPagePath(path: string): string | null {
  const normalized = LEGACY_PAGE_PATH_ALIASES.get(path) ?? path
  return KNOWN_PAGE_PATHS.has(normalized) ? normalized : null
}

function normalizeUrlSuffix(search: string, hash: string): string {
  const normalizedSearch = search.length === 0 || search.startsWith("?") ? search : `?${search}`
  const normalizedHash = hash.length === 0 || hash.startsWith("#") ? hash : `#${hash}`
  return `${normalizedSearch}${normalizedHash}`
}

export function legacyLocaleRedirectHref(
  locale: Locale,
  pathname: string,
  search = "",
  hash = "",
): string | null {
  const inner = trimSlashes(pathname)
  const firstSegment = inner.split("/").filter(Boolean)[0]
  if ((SUPPORTED_LOCALES as readonly string[]).includes(firstSegment)) {
    return null
  }

  const knownPath = normalizeKnownPagePath(inner)
  if (knownPath == null) {
    return null
  }

  return `${localeHref(locale, knownPath)}${normalizeUrlSuffix(search, hash)}`
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
