import type { LocaleMessages, UILocale } from "./locales"
import { LOCALE_MESSAGES } from "./locales"

export type Substitution = string | number
export type Substitutions = Substitution | readonly Substitution[]

function walk(bundle: LocaleMessages, path: string): string | undefined {
  const segments = path.split(".")
  let node: unknown = bundle
  for (const segment of segments) {
    if (node == null || typeof node !== "object")
      return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === "string" ? node : undefined
}

function applySubstitutions(template: string, subs: Substitutions | undefined): string {
  if (subs == null)
    return template
  const arr = Array.isArray(subs) ? subs : [subs]
  return template.replace(/\$(\d)/g, (match, digit: string) => {
    const idx = Number(digit) - 1
    if (idx < 0 || idx >= arr.length)
      return match
    const value = arr[idx]
    return value == null ? match : String(value)
  })
}

/**
 * Resolve a translation key for the given locale, falling back to English and
 * finally returning the raw key when nothing is found. Mirrors the contract
 * of `@wxt-dev/i18n`'s `i18n.t()` (nested dot-paths, $1..$9 placeholders).
 */
export function resolveMessage(
  locale: UILocale,
  key: string,
  substitutions?: Substitutions,
): string {
  const primary = walk(LOCALE_MESSAGES[locale], key)
  if (primary !== undefined)
    return applySubstitutions(primary, substitutions)
  if (locale !== "en") {
    const fallback = walk(LOCALE_MESSAGES.en, key)
    if (fallback !== undefined)
      return applySubstitutions(fallback, substitutions)
  }
  return key
}
