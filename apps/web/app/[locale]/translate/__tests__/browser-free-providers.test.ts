import { describe, expect, it, vi } from "vitest"
import {
  isBrowserFreeProvider,
  runTranslateColumn,
  translateFreeModelInBrowser,
} from "../browser-free-providers"

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

describe("browser free providers", () => {
  it("translates Google directly in the browser", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse([[["你好", "hello"]]]),
    )

    const out = await translateFreeModelInBrowser({
      modelId: "google",
      text: "hello",
      sourceLang: "en",
      targetLang: "zh-CN",
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(out).toEqual({ text: "你好" })
    const url = fetchMock.mock.calls[0][0] as string
    const params = new URL(url).searchParams
    expect(params.get("client")).toBe("gtx")
    expect(params.get("sl")).toBe("en")
    expect(params.get("tl")).toBe("zh-CN")
    expect(params.get("q")).toBe("hello")
  })

  it("translates Microsoft directly in the browser", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const href = String(url)
      if (href.includes("/translate/auth")) return new Response("edge-token")
      return jsonResponse([{ translations: [{ text: "你好" }] }])
    })

    const out = await translateFreeModelInBrowser({
      modelId: "microsoft",
      text: "hello",
      sourceLang: "auto",
      targetLang: "zh-CN",
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(out).toEqual({ text: "你好" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const translateUrl = new URL(fetchMock.mock.calls[1][0] as string)
    expect(translateUrl.searchParams.has("from")).toBe(false)
    expect(translateUrl.searchParams.get("to")).toBe("zh-CN")
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer edge-token",
      }),
    })
  })

  it("falls back to the server when direct free translation fails", async () => {
    const direct = vi.fn(async () => {
      throw new Error("cors blocked")
    })
    const server = vi.fn(async () => ({ text: "server result" }))
    const input = {
      text: "hello",
      sourceLang: "en",
      targetLang: "zh-CN",
      modelId: "google" as const,
      columnId: "col-google",
      clickId: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    }
    const signal = new AbortController().signal

    const out = await runTranslateColumn(input, {
      signal,
      directTranslate: direct,
      serverTranslate: server,
    })

    expect(out).toEqual({ text: "server result" })
    expect(direct).toHaveBeenCalledWith({ ...input, signal })
    expect(server).toHaveBeenCalledWith(input, { signal })
  })

  it("uses the server directly for Pro-only models", async () => {
    const direct = vi.fn()
    const server = vi.fn(async () => ({ text: "llm result" }))
    const input = {
      text: "hello",
      sourceLang: "en",
      targetLang: "zh-CN",
      modelId: "gpt-5.5" as const,
      columnId: "col-gpt-5.5",
      clickId: "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80",
    }
    const signal = new AbortController().signal

    const out = await runTranslateColumn(input, {
      signal,
      directTranslate: direct,
      serverTranslate: server,
    })

    expect(out).toEqual({ text: "llm result" })
    expect(isBrowserFreeProvider(input.modelId)).toBe(false)
    expect(direct).not.toHaveBeenCalled()
    expect(server).toHaveBeenCalledWith(input, { signal })
  })
})
