import { describe, expect, it, vi } from "vitest"
import {
  TranslateProviderError,
  googleTranslate,
  microsoftTranslate,
} from "../free-providers"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("googleTranslate", () => {
  it("concatenates translated segments from a multi-chunk response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        [
          ["你好", "Hello", null, null, 1],
          ["，世界", ", world", null, null, 1],
        ],
      ]),
    )
    const out = await googleTranslate("Hello, world", "en", "zh-CN", fetchMock as any)
    expect(out).toBe("你好，世界")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0][0] as string
    // URL is built via URLSearchParams, so use the same decoder (which
    // correctly decodes `+` to space).
    const params = new URLSearchParams(url.split("?")[1])
    expect(params.get("client")).toBe("gtx")
    expect(params.get("sl")).toBe("en")
    expect(params.get("tl")).toBe("zh-CN")
    expect(params.get("q")).toBe("Hello, world")
  })

  it("passes 'auto' through as the source language (Google supports sl=auto)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([[["hi", "你好", null, null, 1]]]))
    await googleTranslate("你好", "auto", "en", fetchMock as any)
    expect((fetchMock.mock.calls[0][0] as string)).toContain("sl=auto")
  })

  it("throws TranslateProviderError on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }))
    await expect(googleTranslate("hi", "en", "zh-CN", fetchMock as any)).rejects.toMatchObject({
      name: "TranslateProviderError",
      providerId: "google",
      statusCode: 429,
    })
  })

  it("throws on unexpected response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }))
    await expect(googleTranslate("hi", "en", "zh-CN", fetchMock as any)).rejects.toThrow(/shape/)
  })

  it("wraps network failures as provider errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"))
    await expect(googleTranslate("hi", "en", "zh-CN", fetchMock as any)).rejects.toMatchObject({
      providerId: "google",
      message: expect.stringContaining("ECONNRESET"),
    })
  })
})

describe("microsoftTranslate", () => {
  function authedFetch(translatedText: string) {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("/translate/auth")) {
        return new Response("fake-token-abc", { status: 200 })
      }
      return jsonResponse([{ translations: [{ text: translatedText }] }])
    })
    return fetchMock
  }

  it("refreshes auth token then posts translate request", async () => {
    const fetchMock = authedFetch("你好")
    const out = await microsoftTranslate("hello", "en", "zh-CN", fetchMock as any)
    expect(out).toBe("你好")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[0][0] as string)).toContain("/translate/auth")
    const translateCall = fetchMock.mock.calls[1]
    expect((translateCall[0] as string)).toContain("from=en")
    expect((translateCall[0] as string)).toContain("to=zh-CN")
    const init = translateCall[1] as RequestInit
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer fake-token-abc")
  })

  it("converts 'auto' source to empty string (Microsoft semantics)", async () => {
    const fetchMock = authedFetch("hi")
    await microsoftTranslate("你好", "auto", "en", fetchMock as any)
    expect((fetchMock.mock.calls[1][0] as string)).toContain("from=&")
  })

  it("throws TranslateProviderError if auth endpoint fails", async () => {
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }))
    await expect(microsoftTranslate("hi", "en", "zh-CN", fetchMock as any)).rejects.toMatchObject({
      providerId: "microsoft",
      statusCode: 403,
    })
  })

  it("throws TranslateProviderError if translate endpoint returns non-2xx", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("/translate/auth")) return new Response("token-xyz", { status: 200 })
      return new Response("bad gateway", { status: 502 })
    })
    await expect(microsoftTranslate("hi", "en", "zh-CN", fetchMock as any)).rejects.toMatchObject({
      providerId: "microsoft",
      statusCode: 502,
    })
  })

  it("throws on missing translation text in payload", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("/translate/auth")) return new Response("token-xyz", { status: 200 })
      return jsonResponse([{ translations: [{}] }]) // missing .text
    })
    await expect(microsoftTranslate("hi", "en", "zh-CN", fetchMock as any)).rejects.toThrow(/missing translation/)
  })
})

describe("TranslateProviderError", () => {
  it("carries providerId and optional statusCode", () => {
    const err = new TranslateProviderError("google", "boom", 429)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("TranslateProviderError")
    expect(err.providerId).toBe("google")
    expect(err.statusCode).toBe(429)
  })
})
