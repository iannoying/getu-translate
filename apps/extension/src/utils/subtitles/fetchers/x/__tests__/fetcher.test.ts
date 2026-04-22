// @vitest-environment jsdom
import type { XTextTrackLike, XVttCueLike } from "../types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface FakeTextTrack extends XTextTrackLike {}

function makeCue(startTime: number, endTime: number, text: string): XVttCueLike {
  return { startTime, endTime, text }
}

function makeTrack({
  kind = "captions",
  language = "en",
  label = "English",
  cues = null,
}: {
  kind?: string
  language?: string
  label?: string
  cues?: XVttCueLike[] | null
} = {}): FakeTextTrack {
  const track: FakeTextTrack = {
    kind,
    language,
    label,
    mode: "disabled",
    get cues() {
      return cues
    },
  }
  return track
}

function installVideoWithTracks(tracks: FakeTextTrack[]): HTMLVideoElement {
  const container = document.createElement("div")
  container.setAttribute("data-testid", "videoComponent")
  const video = document.createElement("video")
  container.appendChild(video)
  document.body.appendChild(container)

  Object.defineProperty(video, "textTracks", {
    configurable: true,
    get: () => ({
      length: tracks.length,
      [Symbol.iterator]: () => {
        let i = 0
        return {
          next() {
            return i < tracks.length
              ? { value: tracks[i++], done: false }
              : { value: undefined, done: true }
          },
        }
      },
    }),
  })

  return video
}

function stubLocation(path: string, hostname = "x.com") {
  Object.defineProperty(window, "location", {
    value: {
      pathname: path,
      search: "",
      origin: `https://${hostname}`,
      hostname,
      href: `https://${hostname}${path}`,
    },
    writable: true,
  })
}

describe("x subtitles fetcher", () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ""
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reads cues from the first caption track on a /status/{id} page", async () => {
    stubLocation("/jack/status/20")
    const track = makeTrack({
      cues: [
        makeCue(0.5, 3.2, "Hello world"),
        makeCue(3.5, 5.0, "Second cue"),
      ],
    })
    installVideoWithTracks([track])

    const { XSubtitlesFetcher } = await import("../index")
    const fetcher = new XSubtitlesFetcher()
    const subs = await fetcher.fetch()

    expect(subs).toEqual([
      { text: "Hello world", start: 500, end: 3200 },
      { text: "Second cue", start: 3500, end: 5000 },
    ])
    expect(fetcher.getSourceLanguage()).toBe("en")
    // The fetcher must flip the track to "hidden" so native captions don't
    // render over our overlay.
    expect(track.mode).toBe("hidden")
  })

  it("treats twitter.com status URLs identically to x.com", async () => {
    stubLocation("/someone/status/12345", "twitter.com")
    const track = makeTrack({
      language: "ja",
      label: "Japanese",
      cues: [makeCue(0, 1, "こんにちは")],
    })
    installVideoWithTracks([track])

    const { XSubtitlesFetcher } = await import("../index")
    const fetcher = new XSubtitlesFetcher()
    const subs = await fetcher.fetch()

    expect(subs).toEqual([{ text: "こんにちは", start: 0, end: 1000 }])
    expect(fetcher.getSourceLanguage()).toBe("ja")
  })

  it("returns false from hasAvailableSubtitles on non-status pages", async () => {
    stubLocation("/home", "x.com")

    const { XSubtitlesFetcher } = await import("../index")
    const fetcher = new XSubtitlesFetcher()

    await expect(fetcher.hasAvailableSubtitles()).resolves.toBe(false)
    await expect(fetcher.fetch()).rejects.toThrow(/noSubtitlesFound/)
  })

  it("returns false from hasAvailableSubtitles when the video has no caption tracks", async () => {
    stubLocation("/jack/status/20")
    installVideoWithTracks([])

    const { XSubtitlesFetcher } = await import("../index")
    const fetcher = new XSubtitlesFetcher()

    // Poll should give up quickly when we stub the timeout.
    await expect(
      fetcher.hasAvailableSubtitles(),
    ).resolves.toBe(false)
  }, 10_000)

  it("ignores non-caption textTracks (kind = chapters, metadata)", async () => {
    stubLocation("/jack/status/20")
    const chapters = makeTrack({ kind: "chapters", cues: [makeCue(0, 1, "ignored")] })
    const captions = makeTrack({
      kind: "captions",
      language: "en",
      cues: [makeCue(0, 1, "kept")],
    })
    installVideoWithTracks([chapters, captions])

    const { XSubtitlesFetcher } = await import("../index")
    const fetcher = new XSubtitlesFetcher()
    const subs = await fetcher.fetch()

    expect(subs).toEqual([{ text: "kept", start: 0, end: 1000 }])
  })

  it("throws noSubtitlesFound when the caption track has zero cues", async () => {
    stubLocation("/jack/status/20")
    const track = makeTrack({ cues: [] })
    installVideoWithTracks([track])

    const { XSubtitlesFetcher } = await import("../index")
    const fetcher = new XSubtitlesFetcher()

    await expect(fetcher.fetch()).rejects.toThrow(/noSubtitlesFound/)
  })

  it("caches the resolved track hash so shouldUseSameTrack returns true across calls", async () => {
    stubLocation("/jack/status/20")
    const track = makeTrack({ cues: [makeCue(0, 1, "x")] })
    installVideoWithTracks([track])

    const { XSubtitlesFetcher } = await import("../index")
    const fetcher = new XSubtitlesFetcher()
    await fetcher.fetch()

    await expect(fetcher.shouldUseSameTrack()).resolves.toBe(true)

    fetcher.cleanup()
    await expect(fetcher.shouldUseSameTrack()).resolves.toBe(false)
  })

  it("convertXCues skips empty / whitespace-only cue text", async () => {
    const { convertXCues } = await import("../index")
    const result = convertXCues([
      makeCue(0, 1, "first"),
      makeCue(1, 2, "   "),
      makeCue(2, 3, "third"),
    ])
    expect(result).toEqual([
      { text: "first", start: 0, end: 1000 },
      { text: "third", start: 2000, end: 3000 },
    ])
  })
})
