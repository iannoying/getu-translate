import { describe, expect, it } from "vitest"
import { detectLocaleFromLanguages, getRootRedirectLocale, isSupportedLocale } from "../locales"

describe("web i18n locales", () => {
  it("accepts only supported website locales", () => {
    expect(isSupportedLocale("en")).toBe(true)
    expect(isSupportedLocale("zh-CN")).toBe(true)
    expect(isSupportedLocale("zh-TW")).toBe(true)
    expect(isSupportedLocale("fr")).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
  })

  it("maps simplified Chinese browser languages to zh-CN", () => {
    expect(detectLocaleFromLanguages(["zh-CN"])).toBe("zh-CN")
    expect(detectLocaleFromLanguages(["zh-SG"])).toBe("zh-CN")
    expect(detectLocaleFromLanguages(["zh-Hans-US"])).toBe("zh-CN")
    expect(detectLocaleFromLanguages(["zh"])).toBe("zh-CN")
  })

  it("maps traditional Chinese browser languages to zh-TW", () => {
    expect(detectLocaleFromLanguages(["zh-TW"])).toBe("zh-TW")
    expect(detectLocaleFromLanguages(["zh-HK"])).toBe("zh-TW")
    expect(detectLocaleFromLanguages(["zh-MO"])).toBe("zh-TW")
    expect(detectLocaleFromLanguages(["zh-Hant-HK"])).toBe("zh-TW")
  })

  it("falls back to English after scanning unsupported languages", () => {
    expect(detectLocaleFromLanguages(["fr-CA", "en-US"])).toBe("en")
    expect(detectLocaleFromLanguages(["ja-JP", "ko-KR"])).toBe("en")
    expect(detectLocaleFromLanguages([])).toBe("en")
  })

  it("prefers stored locale over browser language on root redirects", () => {
    expect(getRootRedirectLocale("zh-TW", ["en-US"])).toBe("zh-TW")
    expect(getRootRedirectLocale("fr", ["zh-CN"])).toBe("zh-CN")
    expect(getRootRedirectLocale(null, ["zh-HK"])).toBe("zh-TW")
  })
})
