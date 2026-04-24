import { vi } from "vitest"
import "@testing-library/jest-dom"

// Keep test output quiet by default. Individual tests can still spy on these
// methods when they need to assert logging behavior.
// eslint-disable-next-line no-console
console.log = () => {}
// eslint-disable-next-line no-console
console.info = () => {}
console.warn = () => {}
console.error = () => {}

class MemoryStorage implements Storage {
  #store = new Map<string, string>()

  get length() {
    return this.#store.size
  }

  clear() {
    this.#store.clear()
  }

  getItem(key: string) {
    return this.#store.get(key) ?? null
  }

  key(index: number) {
    return [...this.#store.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.#store.delete(key)
  }

  setItem(key: string, value: string) {
    this.#store.set(key, value)
  }
}

// Node 22 exposes built-in Web Storage. In worker processes without a configured
// backing file, reading it emits `--localstorage-file` warnings. Replace it with
// an in-memory test double before app modules import Jotai utils.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
})

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: new MemoryStorage(),
})

// Mock @wxt-dev/i18n module to avoid browser.i18n.getMessage not implemented error.
// Kept for tests that still import via the legacy `#i18n` alias (mostly `import
// type { GeneratedI18nStructure }` — the stub stays in case any value import slips).
vi.mock("#i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

// Mock the in-house runtime-switchable i18n module. Production code pulls
// `i18n` from here after the codemod; tests just need a passthrough that
// returns the key unchanged and stubs the helpers so consumers do not try to
// spin up Jotai stores or hit `browser.storage` during unit tests.
vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string, _subs?: unknown) => key,
  },
  hydrateI18nFromStorage: () => Promise.resolve(),
  hydrateUILocalePreferenceSync: () => {},
  // eslint-disable-next-line react/component-hook-factories -- stub mirroring the hook name; not an actual React hook factory.
  useUILocale: () => "en",
  I18nReactiveRoot: ({ children }: { children: unknown }) => children,
  detectBrowserUILocale: () => "en",
  normaliseLocaleTag: (tag: string | null | undefined) => tag ?? "en",
  getLocalUILocalePreference: () => Promise.resolve("auto"),
  DEFAULT_UI_LOCALE: "en",
  DEFAULT_UI_LOCALE_PREFERENCE: "auto",
  SUPPORTED_UI_LOCALES: ["en", "zh-CN", "zh-TW", "ja", "ko", "ru", "tr", "vi"],
  UI_LOCALE_NATIVE_LABELS: {
    "en": "English",
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文",
    "ja": "日本語",
    "ko": "한국어",
    "ru": "Русский",
    "tr": "Türkçe",
    "vi": "Tiếng Việt",
  },
  // The atoms below are stubbed as `{}` because no test exercises their
  // Jotai semantics through this mock. Tests that need the real atoms
  // (e.g. src/utils/i18n/__tests__/atom.test.ts) import from `../atom`
  // directly, which vitest resolves to the real module.
  baseUILocalePreferenceAtom: {},
  effectiveUILocaleAtom: {},
  uiLocalePreferenceAtom: {},
}))

// Mock the fakeBrowser's i18n.getMessage method which is not implemented in fake-browser
// This is used when WxtVitest plugin replaces browser imports with fake-browser
vi.mock("wxt/testing", async () => {
  const actual = await vi.importActual<any>("wxt/testing")
  return {
    ...actual,
    fakeBrowser: {
      ...actual.fakeBrowser,
      i18n: {
        ...actual.fakeBrowser.i18n,
        getMessage: (key: string) => key.replaceAll("_", "."),
      },
      identity: {
        ...actual.fakeBrowser.identity,
        getRedirectURL: () => "https://mock-redirect-url.chromiumapp.org/",
      },
      runtime: {
        ...actual.fakeBrowser.runtime,
        getManifest: () => ({
          manifest_version: 3,
          name: "Read Frog",
          version: "1.0.0",
          description: "Test manifest",
        }),
      },
    },
  }
})

// JSDom + Vitest don't play well with each other. Long story short - default
// TextEncoder produces Uint8Array objects that are _different_ from the global
// Uint8Array objects, so some functions that compare their types explode.
// https://github.com/vitest-dev/vitest/issues/4043#issuecomment-1905172846
class ESBuildAndJSDOMCompatibleTextEncoder extends TextEncoder {
  constructor() {
    super()
  }

  encode(input: string) {
    if (typeof input !== "string") {
      throw new TypeError("`input` must be a string")
    }

    const decodedURI = decodeURIComponent(encodeURIComponent(input))
    const arr = new Uint8Array(decodedURI.length)
    const chars = decodedURI.split("")
    for (let i = 0; i < chars.length; i++) {
      arr[i] = decodedURI[i].charCodeAt(0)
    }
    return arr
  }
}

globalThis.TextEncoder = ESBuildAndJSDOMCompatibleTextEncoder
