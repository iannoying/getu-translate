import type { ReactElement, ReactNode } from "react"
import type { UILocale, UILocalePreference } from "./locales"
import type { Substitutions } from "./resolver"
import { useAtomValue } from "jotai"
import { getDefaultStore } from "jotai/vanilla"
import {
  effectiveUILocaleAtom,
  getLocalUILocalePreference,
  hydrateUILocalePreferenceSync,
} from "./atom"
import { DEFAULT_UI_LOCALE, DEFAULT_UI_LOCALE_PREFERENCE } from "./locales"
import { resolveMessage } from "./resolver"

// Keep `currentLocale` in sync with the Jotai store so non-React call sites
// (module-scope constants, background scripts, utilities) always resolve
// against the live preference without needing to await storage.
//
// The module-level subscription is set up once on import. It fires
// synchronously with the atom's current value and then on every change.
let currentLocale: UILocale = DEFAULT_UI_LOCALE
const store = getDefaultStore()
currentLocale = store.get(effectiveUILocaleAtom)
store.sub(effectiveUILocaleAtom, () => {
  currentLocale = store.get(effectiveUILocaleAtom)
})

/**
 * Drop-in replacement for `@wxt-dev/i18n`'s `i18n` export.
 *
 * Signature:
 *   i18n.t(key)                 // look up a dot-path key
 *   i18n.t(key, substitutions)  // substitutions replace $1..$9 in the message
 *
 * Note: `@wxt-dev/i18n` also supports an overload with a `quantity: number`
 * for plural rules. The codebase currently uses no plural keys (verified by
 * grep), so we intentionally omit that overload. If plurals are added later,
 * extend this signature before re-introducing plural YAML entries.
 *
 * Unlike `@wxt-dev/i18n`, this resolver reads from our runtime-switchable
 * locale preference, so a user on an English Chrome install can still see the
 * UI in 简体中文 after selecting it in Options → General → Interface Language.
 */
export const i18n = {
  t(key: string, substitutions?: Substitutions): string {
    return resolveMessage(currentLocale, key, substitutions)
  },
}

/**
 * Entrypoint boot helper. Call once in each document (popup / options / every
 * content-script UI entry) BEFORE rendering, so the very first paint already
 * sees the user's chosen locale. Without this hook the Jotai `onMount` read
 * would race with first render, producing a brief English flash for users on
 * non-English Chrome installs.
 *
 * Safe to call multiple times — subsequent calls short-circuit once hydrated.
 */
let hydrated = false
let hydratedPref: UILocalePreference = DEFAULT_UI_LOCALE_PREFERENCE
let hydratePromise: Promise<UILocalePreference> | null = null
/**
 * Resolves with the locale preference loaded from storage. The caller is
 * expected to pass this value into the entrypoint's `useHydrateAtoms` tuple
 * (`[baseUILocalePreferenceAtom, pref]`) so the React-scoped Jotai Provider
 * store also starts with the correct value — otherwise its own `onMount`
 * async storage read would race with first render.
 */
export function hydrateI18nFromStorage(): Promise<UILocalePreference> {
  if (hydrated)
    return Promise.resolve(hydratedPref)
  if (hydratePromise)
    return hydratePromise
  hydratePromise = getLocalUILocalePreference()
    .then((pref) => {
      hydrateUILocalePreferenceSync(pref)
      // Re-read now that the default store has been primed.
      currentLocale = store.get(effectiveUILocaleAtom)
      hydratedPref = pref
      hydrated = true
      return pref
    })
    .catch(() => {
      // Non-fatal: leave `currentLocale` at whatever detect.ts produced and
      // fall through with the default preference so callers can still hydrate.
      hydrated = true
      return DEFAULT_UI_LOCALE_PREFERENCE
    })
    .finally(() => {
      hydratePromise = null
    })
  return hydratePromise
}

/**
 * React hook that returns the effective UI locale. Components that want to
 * re-render when the locale changes (e.g. the language selector preview) can
 * depend on this instead of reading `i18n.t()` results at build time.
 */
export function useUILocale(): UILocale {
  return useAtomValue(effectiveUILocaleAtom)
}

/**
 * Mount-once root wrapper that subscribes to the effective locale atom. When
 * the user switches languages in Options, this component re-renders, which
 * cascades through children and causes every `i18n.t()` call in the tree to
 * re-resolve against the new `currentLocale`. Use once per React root
 * (popup / options / each content-script React tree / upgrade-success).
 */
export function I18nReactiveRoot({ children }: { children: ReactNode }): ReactElement {
  // Subscribing is the whole point — the return value is intentionally unused.
  useUILocale()
  return children as ReactElement
}

export {
  baseUILocalePreferenceAtom,
  effectiveUILocaleAtom,
  getLocalUILocalePreference,
  hydrateUILocalePreferenceSync,
  uiLocalePreferenceAtom,
} from "./atom"
export { detectBrowserUILocale, normaliseLocaleTag } from "./detect"
export { DEFAULT_UI_LOCALE, type UILocale } from "./locales"
export {
  DEFAULT_UI_LOCALE_PREFERENCE,
  SUPPORTED_UI_LOCALES,
  UI_LOCALE_NATIVE_LABELS,
  type UILocalePreference,
} from "./locales"
