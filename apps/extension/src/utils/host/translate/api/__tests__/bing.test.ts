import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetTokenCacheForTesting, translateBing } from "../bing"

const fetchMock = vi.fn()

const TOKEN_HTML = `
  <html>
    <script>
      var _G = {}; _G.IID="translator.5028";
      IG:"ABC123DEF456"
      params_AbusePreventionHelper = [1745000000000,"tok3nV4lue",3600]
    </script>
  </html>
`

const TRANSLATE_RESPONSE = [
  {
    translations: [{ text: "你好，世界", to: "zh-Hans" }],
  },
]

describe("translateBing", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    resetTokenCacheForTesting()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetTokenCacheForTesting()
  })

  it("happy path: fetches token then translates and returns text", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(TOKEN_HTML),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(TRANSLATE_RESPONSE),
      })

    const result = await translateBing({ text: "Hello, World", from: "en", to: "zh-Hans" })

    expect(result).toEqual({ text: "你好，世界" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.bing.com/translator")
    expect(fetchMock.mock.calls[1][0]).toContain("ttranslatev3")
    expect(fetchMock.mock.calls[1][0]).toContain("IG=ABC123DEF456")
  })

  it("throws when IG token is missing from translator page HTML", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue("<html>no tokens here</html>"),
    })

    await expect(
      translateBing({ text: "Hello", from: "en", to: "zh-Hans" }),
    ).rejects.toThrow(/IG/i)
  })

  it("reuses cached token within TTL without re-fetching translator page", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(TOKEN_HTML),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(TRANSLATE_RESPONSE),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ translations: [{ text: "再见" }] }]),
      })

    await translateBing({ text: "Hello", from: "en", to: "zh-Hans" })
    const result = await translateBing({ text: "Goodbye", from: "en", to: "zh-Hans" })

    expect(result).toEqual({ text: "再见" })
    // Token page fetched only once; translate called twice = 3 total
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.bing.com/translator")
    expect(fetchMock.mock.calls[1][0]).toContain("ttranslatev3")
    expect(fetchMock.mock.calls[2][0]).toContain("ttranslatev3")
  })

  it("throws on non-ok translate response", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(TOKEN_HTML),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

    await expect(
      translateBing({ text: "Hello", from: "en", to: "zh-Hans" }),
    ).rejects.toThrow("Bing translate HTTP 429")
  })

  it("throws with HTTP status when token page returns 429", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
    })

    await expect(
      translateBing({ text: "Hello", from: "en", to: "zh-Hans" }),
    ).rejects.toThrow("Bing translator page HTTP 429")
  })

  it("re-fetches token after TTL expires using injectable clock", async () => {
    let fakeNow = 1_000_000
    const now = () => fakeNow

    fetchMock
      // First token fetch
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(TOKEN_HTML),
      })
      // First translate
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(TRANSLATE_RESPONSE),
      })
      // Second token fetch (after TTL)
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(TOKEN_HTML),
      })
      // Second translate
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ translations: [{ text: "再见" }] }]),
      })

    await translateBing({ text: "Hello", from: "en", to: "zh-Hans" }, { now })

    // Advance clock past 30-minute TTL
    fakeNow += 31 * 60_000

    const result = await translateBing({ text: "Goodbye", from: "en", to: "zh-Hans" }, { now })

    expect(result).toEqual({ text: "再见" })
    // Token page fetched twice (once per call after TTL), translate called twice = 4 total
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.bing.com/translator")
    expect(fetchMock.mock.calls[2][0]).toBe("https://www.bing.com/translator")
  })

  it("throws on malformed translate response missing translations array", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(TOKEN_HTML),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ detectedLanguage: { language: "en" } }]),
      })

    await expect(
      translateBing({ text: "Hello", from: "en", to: "zh-Hans" }),
    ).rejects.toThrow("Bing translate: unexpected response format")
  })
})
