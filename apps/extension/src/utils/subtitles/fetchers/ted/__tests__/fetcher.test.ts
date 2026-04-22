// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import transcriptFixture from "./fixtures/transcript.json" with { type: "json" }

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
      origin: "https://www.ted.com",
      hostname: "www.ted.com",
      href: `https://www.ted.com${path}${search}`,
    },
    writable: true,
  })
}

describe("ted subtitles fetcher", () => {
  beforeEach(() => {
    vi.resetModules()
    sendMessageMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches the transcript for a /talks/{slug} URL and flattens paragraphs.cues", async () => {
    stubLocation("/talks/simon_sinek_how_great_leaders_inspire_action")

    let requestedUrl = ""
    sendMessageMock.mockImplementation(async (_channel: string, payload: any) => {
      requestedUrl = payload.url
      return respondText(transcriptFixture)
    })

    const { TedSubtitlesFetcher } = await import("../index")
    const fetcher = new TedSubtitlesFetcher()

    const subs = await fetcher.fetch()

    expect(requestedUrl).toBe(
      "https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action/transcript.json?language=en",
    )
    // 7 cues across 3 paragraphs, flattened to a single array
    expect(subs).toHaveLength(7)
    expect(subs[0]).toEqual({
      text: "How do you explain it when things don't go as we assume?",
      start: 1000,
      end: 5200,
    })
    // Last cue uses the TED_FINAL_CUE_DURATION_MS (4000) fallback
    expect(subs[subs.length - 1]).toEqual({
      text: "And yet, they're just a computer company.",
      start: 22800,
      end: 26800,
    })
    expect(fetcher.getSourceLanguage()).toBe("en")
  })

  it("derives each cue's end time from the start of the next cue", async () => {
    stubLocation("/talks/simon_sinek_how_great_leaders_inspire_action")
    sendMessageMock.mockResolvedValue(respondText(transcriptFixture))

    const { TedSubtitlesFetcher } = await import("../index")
    const fetcher = new TedSubtitlesFetcher()
    const subs = await fetcher.fetch()

    // cue[0].end === cue[1].start
    expect(subs[0].end).toBe(subs[1].start)
    // every non-last end === next.start
    for (let i = 0; i < subs.length - 1; i += 1) {
      expect(subs[i].end).toBe(subs[i + 1].start)
    }
  })

  it("returns no subtitles (rejects) when transcript endpoint returns 404", async () => {
    stubLocation("/talks/some_unknown_talk_with_no_transcript")
    sendMessageMock.mockResolvedValue({
      status: 404,
      statusText: "Not Found",
      headers: [["content-type", "text/html"]],
      body: "",
      bodyEncoding: "text",
    })

    const { TedSubtitlesFetcher } = await import("../index")
    const fetcher = new TedSubtitlesFetcher()

    await expect(fetcher.fetch()).rejects.toThrow(/noSubtitlesFound/)
    await expect(fetcher.hasAvailableSubtitles()).resolves.toBe(false)
  })

  it("returns false from hasAvailableSubtitles on non-talk pages", async () => {
    stubLocation("/playlists/123/most_popular")

    const { TedSubtitlesFetcher } = await import("../index")
    const fetcher = new TedSubtitlesFetcher()

    await expect(fetcher.hasAvailableSubtitles()).resolves.toBe(false)
    await expect(fetcher.fetch()).rejects.toThrow(/noSubtitlesFound/)
    // No network call should have been issued — the slug resolver short-circuits.
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("caches the resolved track hash across calls so shouldUseSameTrack returns true", async () => {
    stubLocation("/talks/simon_sinek_how_great_leaders_inspire_action")
    sendMessageMock.mockResolvedValue(respondText(transcriptFixture))

    const { TedSubtitlesFetcher } = await import("../index")
    const fetcher = new TedSubtitlesFetcher()
    await fetcher.fetch()

    await expect(fetcher.shouldUseSameTrack()).resolves.toBe(true)

    fetcher.cleanup()
    await expect(fetcher.shouldUseSameTrack()).resolves.toBe(false)
  })

  it("builds the transcript URL with language query param", async () => {
    const { buildTedTranscriptUrl } = await import("../index")
    expect(buildTedTranscriptUrl("my_slug", "en")).toBe(
      "https://www.ted.com/talks/my_slug/transcript.json?language=en",
    )
    expect(buildTedTranscriptUrl("another_slug", "es")).toBe(
      "https://www.ted.com/talks/another_slug/transcript.json?language=es",
    )
  })

  it("flattenTedCues skips empty text and applies final-cue duration fallback", async () => {
    const { flattenTedCues } = await import("../index")
    const result = flattenTedCues([
      { time: 0, text: "first" },
      { time: 1000, text: "  " },
      { time: 2000, text: "second" },
    ])
    expect(result).toEqual([
      { text: "first", start: 0, end: 1000 },
      { text: "second", start: 2000, end: 6000 },
    ])
    expect(flattenTedCues([])).toEqual([])
  })
})
