import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { translateLibre } from "../libre"

const fetchMock = vi.fn()

describe("translateLibre", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("posts JSON with q/source/target/format fields to configured endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ translatedText: "Hola" }),
    })

    await translateLibre({ text: "Hello", from: "en", to: "es", endpoint: "https://libretranslate.com/translate" })

    expect(fetchMock).toHaveBeenCalledWith("https://libretranslate.com/translate", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
    }))

    const [, requestInit] = fetchMock.mock.calls[0]
    expect(JSON.parse(requestInit.body)).toEqual({
      q: "Hello",
      source: "en",
      target: "es",
      format: "text",
    })
  })

  it("returns translatedText from response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ translatedText: "Bonjour" }),
    })

    const result = await translateLibre({ text: "Hello", from: "en", to: "fr", endpoint: "https://libretranslate.com/translate" })

    expect(result).toEqual({ text: "Bonjour" })
  })

  it("includes api_key in body when provided", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ translatedText: "Hola" }),
    })

    await translateLibre({ text: "Hello", from: "en", to: "es", endpoint: "https://libretranslate.com/translate", apiKey: "my-secret-key" })

    const [, requestInit] = fetchMock.mock.calls[0]
    expect(JSON.parse(requestInit.body)).toEqual({
      q: "Hello",
      source: "en",
      target: "es",
      format: "text",
      api_key: "my-secret-key",
    })
  })

  it("does NOT include api_key in body when not provided", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ translatedText: "Hola" }),
    })

    await translateLibre({ text: "Hello", from: "en", to: "es", endpoint: "https://libretranslate.com/translate" })

    const [, requestInit] = fetchMock.mock.calls[0]
    const parsed = JSON.parse(requestInit.body)
    expect(parsed).not.toHaveProperty("api_key")
  })

  it("throws with status code on HTTP error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn().mockResolvedValue({}),
    })

    await expect(
      translateLibre({ text: "Hello", from: "en", to: "es", endpoint: "https://libretranslate.com/translate" }),
    ).rejects.toThrow("LibreTranslate HTTP 429")
  })

  it("throws with error message when payload contains error field", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ error: "Language pair not supported" }),
    })

    await expect(
      translateLibre({ text: "Hello", from: "en", to: "xx", endpoint: "https://libretranslate.com/translate" }),
    ).rejects.toThrow("LibreTranslate: Language pair not supported")
  })

  it("throws 'invalid JSON response' when HTTP 200 body is not valid JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token < in JSON")),
    })

    await expect(
      translateLibre({ text: "Hello", from: "en", to: "es", endpoint: "https://libretranslate.com/translate" }),
    ).rejects.toThrow("LibreTranslate: invalid JSON response")
  })

  it("does NOT include api_key in body when apiKey is whitespace-only", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ translatedText: "Hola" }),
    })

    await translateLibre({ text: "Hello", from: "en", to: "es", endpoint: "https://libretranslate.com/translate", apiKey: "   " })

    const [, requestInit] = fetchMock.mock.calls[0]
    const parsed = JSON.parse(requestInit.body)
    expect(parsed).not.toHaveProperty("api_key")
  })
})
