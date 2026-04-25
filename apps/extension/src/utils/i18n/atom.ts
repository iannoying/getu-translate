import type { UILocale, UILocalePreference } from "./locales"
import { storage } from "#imports"
import { atom, getDefaultStore } from "jotai"
import { swallowInvalidatedStorageRead } from "@/utils/extension-lifecycle"
import { logger } from "@/utils/logger"
import { detectBrowserUILocale } from "./detect"
import { DEFAULT_UI_LOCALE_PREFERENCE, isUILocalePreference } from "./locales"
import { UI_LOCALE_STORAGE_KEY } from "./storage-keys"

const storageKey = `local:${UI_LOCALE_STORAGE_KEY}` as const

// Base atom: the raw user preference ("auto" or a concrete locale). Hydrated
// from storage at app boot (see getLocalUILocalePreference) and kept in sync
// via the onMount watcher.
export const baseUILocalePreferenceAtom = atom<UILocalePreference>(DEFAULT_UI_LOCALE_PREFERENCE)

// Writable view: persists every change to storage, with rollback on failure
// and an optimistic in-memory update so subsequent reads see the new value
// synchronously (same pattern as themeModeAtom).
export const uiLocalePreferenceAtom = atom(
  get => get(baseUILocalePreferenceAtom),
  async (get, set, newValue: UILocalePreference) => {
    const prev = get(baseUILocalePreferenceAtom)
    set(baseUILocalePreferenceAtom, newValue)
    try {
      await storage.setItem(storageKey, newValue)
    }
    catch (error) {
      logger.error("Failed to persist uiLocale preference", { newValue, error })
      set(baseUILocalePreferenceAtom, prev)
    }
  },
)

// Derived atom: resolves "auto" to the browser-detected locale. Everything
// that needs an actual locale (including the i18n resolver) reads from here.
export const effectiveUILocaleAtom = atom<UILocale>((get) => {
  const pref = get(baseUILocalePreferenceAtom)
  return pref === "auto" ? detectBrowserUILocale() : pref
})

baseUILocalePreferenceAtom.onMount = (setAtom) => {
  void storage.getItem<UILocalePreference>(storageKey).then((value) => {
    setAtom(isUILocalePreference(value) ? value : DEFAULT_UI_LOCALE_PREFERENCE)
  }).catch(swallowInvalidatedStorageRead("baseUILocalePreferenceAtom initial"))
  const unwatch = storage.watch<UILocalePreference>(storageKey, (value) => {
    // A `null` value here means the key was cleared (e.g. user wiped extension
    // data); reset to the default so downstream consumers stop seeing the
    // last-known override.
    setAtom(isUILocalePreference(value) ? value : DEFAULT_UI_LOCALE_PREFERENCE)
  })

  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void storage.getItem<UILocalePreference>(storageKey).then((value) => {
        setAtom(isUILocalePreference(value) ? value : DEFAULT_UI_LOCALE_PREFERENCE)
      }).catch(swallowInvalidatedStorageRead("baseUILocalePreferenceAtom visibilitychange"))
    }
  }
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", handleVisibilityChange)

  return () => {
    unwatch()
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", handleVisibilityChange)
  }
}

/**
 * Async read of the stored preference, for hydration at entrypoint boot
 * (parallel to getLocalThemeMode). Returns DEFAULT_UI_LOCALE_PREFERENCE
 * ("auto") when nothing is persisted yet.
 */
export async function getLocalUILocalePreference(): Promise<UILocalePreference> {
  const value = await storage.getItem<UILocalePreference>(storageKey)
  return isUILocalePreference(value) ? value : DEFAULT_UI_LOCALE_PREFERENCE
}

/**
 * Push a preference value into the base atom synchronously. Used by entrypoint
 * boot code (popup/options main.tsx) after awaiting `getLocalUILocalePreference`
 * so the very first render — and any `i18n.t()` call that happens during it —
 * already sees the user's choice, avoiding a flash-of-English.
 */
export function hydrateUILocalePreferenceSync(pref: UILocalePreference): void {
  getDefaultStore().set(baseUILocalePreferenceAtom, pref)
}
