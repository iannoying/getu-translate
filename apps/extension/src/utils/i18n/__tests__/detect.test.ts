import { describe, expect, it } from "vitest"
import { detectBrowserUILocale, normaliseLocaleTag } from "../detect"

describe("normaliseLocaleTag", () => {
  it("maps zh-HK and zh-MO to zh-TW (traditional Chinese)", () => {
    expect(normaliseLocaleTag("zh-HK")).toBe("zh-TW")
    expect(normaliseLocaleTag("zh-MO")).toBe("zh-TW")
    expect(normaliseLocaleTag("zh-Hant")).toBe("zh-TW")
    expect(normaliseLocaleTag("zh-Hant-HK")).toBe("zh-TW")
  })

  it("maps zh-SG and bare zh to zh-CN (simplified Chinese)", () => {
    expect(normaliseLocaleTag("zh-SG")).toBe("zh-CN")
    expect(normaliseLocaleTag("zh-Hans")).toBe("zh-CN")
    expect(normaliseLocaleTag("zh-Hans-CN")).toBe("zh-CN")
    expect(normaliseLocaleTag("zh")).toBe("zh-CN")
  })

  it("preserves exact supported tags", () => {
    expect(normaliseLocaleTag("zh-CN")).toBe("zh-CN")
    expect(normaliseLocaleTag("zh-TW")).toBe("zh-TW")
    expect(normaliseLocaleTag("en")).toBe("en")
  })

  it("matches the primary language subtag for regional variants", () => {
    expect(normaliseLocaleTag("ja-JP")).toBe("ja")
    expect(normaliseLocaleTag("ko-KR")).toBe("ko")
    expect(normaliseLocaleTag("ru-RU")).toBe("ru")
    expect(normaliseLocaleTag("tr-TR")).toBe("tr")
    expect(normaliseLocaleTag("vi-VN")).toBe("vi")
    expect(normaliseLocaleTag("en-US")).toBe("en")
    expect(normaliseLocaleTag("en-GB")).toBe("en")
  })

  it("falls back to en for unsupported languages", () => {
    expect(normaliseLocaleTag("de-DE")).toBe("en")
    expect(normaliseLocaleTag("fr-FR")).toBe("en")
    expect(normaliseLocaleTag("es-ES")).toBe("en")
    expect(normaliseLocaleTag("pt-BR")).toBe("en")
    expect(normaliseLocaleTag("it")).toBe("en")
  })

  it("tolerates underscore separators and mixed case", () => {
    expect(normaliseLocaleTag("zh_HK")).toBe("zh-TW")
    expect(normaliseLocaleTag("JA_JP")).toBe("ja")
  })

  it("returns en for empty or nullish input", () => {
    expect(normaliseLocaleTag("")).toBe("en")
    expect(normaliseLocaleTag(null)).toBe("en")
    expect(normaliseLocaleTag(undefined)).toBe("en")
  })
})

describe("detectBrowserUILocale", () => {
  it("returns a supported locale without throwing", () => {
    // In the test environment neither browser.i18n nor navigator.language
    // is reliably populated; the detector must still return a safe default.
    const result = detectBrowserUILocale()
    expect(["en", "zh-CN", "zh-TW", "ja", "ko", "ru", "tr", "vi"]).toContain(result)
  })
})
