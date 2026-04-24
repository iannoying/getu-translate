import { getDefaultStore } from "jotai"
import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing"
import {
  baseUILocalePreferenceAtom,
  effectiveUILocaleAtom,
  getLocalUILocalePreference,
  hydrateUILocalePreferenceSync,
  uiLocalePreferenceAtom,
} from "../atom"
import { DEFAULT_UI_LOCALE_PREFERENCE } from "../locales"

// Must match UI_LOCALE_STORAGE_KEY in @/utils/constants/config. Duplicated here
// rather than imported because that module pulls in heavyweight project deps
// (contract/definitions) that the unit-test harness does not need to resolve.
const UI_LOCALE_STORAGE_KEY = "uiLocale"

describe("uiLocale atom", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    // Reset atom state so tests are isolated.
    getDefaultStore().set(baseUILocalePreferenceAtom, DEFAULT_UI_LOCALE_PREFERENCE)
  })

  it("returns the default preference when storage is empty", async () => {
    const pref = await getLocalUILocalePreference()
    expect(pref).toBe("auto")
  })

  it("returns the stored preference when a valid value is persisted", async () => {
    await fakeBrowser.storage.local.set({ [UI_LOCALE_STORAGE_KEY]: "zh-CN" })
    const pref = await getLocalUILocalePreference()
    expect(pref).toBe("zh-CN")
  })

  it("falls back to the default when the stored value is invalid", async () => {
    await fakeBrowser.storage.local.set({ [UI_LOCALE_STORAGE_KEY]: "klingon" })
    const pref = await getLocalUILocalePreference()
    expect(pref).toBe("auto")
  })

  it("hydrateUILocalePreferenceSync primes the base atom", () => {
    hydrateUILocalePreferenceSync("ja")
    expect(getDefaultStore().get(baseUILocalePreferenceAtom)).toBe("ja")
  })

  it("effectiveUILocaleAtom passes through concrete preferences", () => {
    hydrateUILocalePreferenceSync("zh-TW")
    expect(getDefaultStore().get(effectiveUILocaleAtom)).toBe("zh-TW")
  })

  it("uiLocalePreferenceAtom persists the written value to storage", async () => {
    await getDefaultStore().set(uiLocalePreferenceAtom, "ko")
    expect(getDefaultStore().get(baseUILocalePreferenceAtom)).toBe("ko")
    const stored = await fakeBrowser.storage.local.get(UI_LOCALE_STORAGE_KEY)
    expect(stored[UI_LOCALE_STORAGE_KEY]).toBe("ko")
  })
})
