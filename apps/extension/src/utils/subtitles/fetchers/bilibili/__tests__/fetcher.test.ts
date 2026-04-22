// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import loggedInFixture from "./fixtures/player-v2-logged-in.json" with { type: "json" }
import loggedOutFixture from "./fixtures/player-v2-logged-out.json" with { type: "json" }

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

function respondText(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: [["content-type", "application/json"]],
    body: JSON.stringify(body),
    bodyEncoding: "text",
  }
}

function stubLocation(path: string, search = "") {
  Object.defineProperty(window, "location", {
    value: {
      pathname: path,
      search,
      origin: "https://www.bilibili.com",
      hostname: "www.bilibili.com",
      href: `https://www.bilibili.com${path}${search}`,
    },
    writable: true,
  })
}

function buildViewResponse(bvid: string, cid: number, pages: { cid: number }[] = []) {
  return {
    code: 0,
    message: "0",
    data: {
      bvid,
      aid: 170001,
      cid,
      pages: pages.length
        ? pages.map((p, i) => ({ cid: p.cid, page: i + 1, part: `P${i + 1}` }))
        : [{ cid, page: 1, part: "P1" }],
    },
  }
}

describe("bilibili subtitles fetcher", () => {
  beforeEach(() => {
    vi.resetModules()
    sendMessageMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches human subtitles for a BV URL and converts cue timings to ms", async () => {
    stubLocation("/video/BV1xx411c7mu")

    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText(buildViewResponse("BV1xx411c7mu", 98765))
      }
      if (payload.url.includes("/x/player/v2")) {
        return respondText(loggedInFixture)
      }
      if (payload.url.startsWith("https://aisubtitle.hdslb.com/")) {
        return respondText({
          body: [
            { from: 0.5, to: 3.2, content: "你好，世界" },
            { from: 3.5, to: 5.0, content: "这是测试" },
          ],
        })
      }
      throw new Error(`Unhandled URL: ${payload.url}`)
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()

    const subs = await fetcher.fetch()
    expect(subs).toEqual([
      { text: "你好，世界", start: 500, end: 3200 },
      { text: "这是测试", start: 3500, end: 5000 },
    ])
    expect(fetcher.getSourceLanguage()).toBe("zh-CN")
  })

  it("prefers human tracks over ai-generated tracks when both exist", async () => {
    stubLocation("/video/BV1xx411c7mu")

    let subtitleRequestUrl: string | null = null
    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText(buildViewResponse("BV1xx411c7mu", 1))
      }
      if (payload.url.includes("/x/player/v2")) {
        return respondText(loggedInFixture)
      }
      subtitleRequestUrl = payload.url
      return respondText({ body: [] })
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()
    await fetcher.fetch()

    expect(subtitleRequestUrl).toBe("https://aisubtitle.hdslb.com/bfs/subtitle/prod/170001-zhCN.json")
  })

  it("falls back to the only ai-track when no human subtitles are present", async () => {
    stubLocation("/video/BV1xx411c7mu")

    let subtitleRequestUrl: string | null = null
    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText(buildViewResponse("BV1xx411c7mu", 1))
      }
      if (payload.url.includes("/x/player/v2")) {
        return respondText(loggedOutFixture)
      }
      subtitleRequestUrl = payload.url
      return respondText({ body: [{ from: 1, to: 2, content: "AI" }] })
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()
    const subs = await fetcher.fetch()

    expect(subtitleRequestUrl).toBe("https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/170001-aizh.json")
    expect(subs).toHaveLength(1)
    expect(fetcher.getSourceLanguage()).toBe("ai-zh")
  })

  it("returns no subtitles when the player response is empty", async () => {
    stubLocation("/video/BV1xx411c7mu")

    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText(buildViewResponse("BV1xx411c7mu", 1))
      }
      if (payload.url.includes("/x/player/v2")) {
        return respondText({ code: 0, data: { subtitle: { subtitles: [] } } })
      }
      return respondText({ body: [] })
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()
    await expect(fetcher.fetch()).rejects.toThrow(/noSubtitlesFound/)
    await expect(fetcher.hasAvailableSubtitles()).resolves.toBe(false)
  })

  it("uses the cid for the current `?p=` page on multi-part videos", async () => {
    stubLocation("/video/BV1xx411c7mu", "?p=2")

    let playerUrl = ""
    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText(buildViewResponse("BV1xx411c7mu", 111, [
          { cid: 111 },
          { cid: 222 },
          { cid: 333 },
        ]))
      }
      if (payload.url.includes("/x/player/v2")) {
        playerUrl = payload.url
        return respondText(loggedInFixture)
      }
      return respondText({ body: [] })
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()
    await fetcher.fetch()

    expect(playerUrl).toContain("cid=222")
    expect(playerUrl).toContain("bvid=BV1xx411c7mu")
  })

  it("uses aid for legacy av URLs", async () => {
    stubLocation("/video/av170001")

    const urls: string[] = []
    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      urls.push(payload.url)
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText(buildViewResponse("BV1xx411c7mu", 55555))
      }
      if (payload.url.includes("/x/player/v2")) {
        return respondText(loggedInFixture)
      }
      return respondText({ body: [] })
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()
    await fetcher.fetch()

    const viewUrl = urls.find(u => u.includes("/x/web-interface/view"))!
    const playerUrl = urls.find(u => u.includes("/x/player/v2"))!
    expect(viewUrl).toContain("aid=170001")
    expect(viewUrl).not.toContain("bvid=")
    expect(playerUrl).toContain("aid=170001")
    expect(playerUrl).toContain("cid=55555")
  })

  it("caches the resolved track hash across calls so shouldUseSameTrack returns true", async () => {
    stubLocation("/video/BV1xx411c7mu")

    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText(buildViewResponse("BV1xx411c7mu", 777))
      }
      if (payload.url.includes("/x/player/v2")) {
        return respondText(loggedInFixture)
      }
      return respondText({ body: [{ from: 0, to: 1, content: "x" }] })
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()
    await fetcher.fetch()

    await expect(fetcher.shouldUseSameTrack()).resolves.toBe(true)

    fetcher.cleanup()
    await expect(fetcher.shouldUseSameTrack()).resolves.toBe(false)
  })

  it("normalizes protocol-relative subtitle URLs to https", async () => {
    const { normalizeBilibiliSubtitleUrl } = await import("../index")
    expect(normalizeBilibiliSubtitleUrl("//aisubtitle.hdslb.com/bfs/subtitle/foo.json"))
      .toBe("https://aisubtitle.hdslb.com/bfs/subtitle/foo.json")
    expect(normalizeBilibiliSubtitleUrl("http://aisubtitle.hdslb.com/bfs/subtitle/foo.json"))
      .toBe("https://aisubtitle.hdslb.com/bfs/subtitle/foo.json")
    expect(normalizeBilibiliSubtitleUrl("https://aisubtitle.hdslb.com/bfs/subtitle/foo.json"))
      .toBe("https://aisubtitle.hdslb.com/bfs/subtitle/foo.json")
  })

  it("rejects when cid cannot be resolved from view API", async () => {
    stubLocation("/video/BV1xx411c7mu")

    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      if (payload.url.includes("/x/web-interface/view")) {
        return respondText({ code: -400, message: "bad request" }, 200)
      }
      return respondText({ body: [] })
    })

    const { BilibiliSubtitlesFetcher } = await import("../index")
    const fetcher = new BilibiliSubtitlesFetcher()

    await expect(fetcher.fetch()).rejects.toThrow(/noSubtitlesFound/)
  })
})
