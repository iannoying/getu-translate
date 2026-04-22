import type { SubtitlesFragment } from "../../types"
import type { SubtitlesFetcher } from "../types"
import type { XResolvedTrack, XTextTrackLike, XVttCueLike } from "./types"
import { i18n } from "#imports"
import {
  X_TEXTTRACKS_POLL_INTERVAL_MS,
  X_TEXTTRACKS_POLL_TIMEOUT_MS,
  X_VIDEO_SELECTOR,
} from "@/utils/constants/subtitles"
import { OverlaySubtitlesError } from "@/utils/subtitles/errors"
import { getXTweetId } from "@/utils/subtitles/video-id"

const CAPTION_TRACK_KINDS = new Set(["captions", "subtitles"])

/**
 * Convert a list of `VTTCue`-like objects to the shared `SubtitlesFragment`
 * representation (milliseconds, trimmed text).
 */
export function convertXCues(cues: ArrayLike<XVttCueLike>): SubtitlesFragment[] {
  const result: SubtitlesFragment[] = []
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i]
    const text = cue.text.trim()
    if (!text) {
      continue
    }
    result.push({
      text,
      start: Math.round(cue.startTime * 1000),
      end: Math.round(cue.endTime * 1000),
    })
  }
  return result
}

/**
 * Pick the first caption / subtitle track from an HTMLVideoElement. Returns
 * `null` if the video has no textTracks or only non-caption tracks (e.g.
 * chapters, metadata).
 */
export function selectXTrack(video: HTMLVideoElement | null): XTextTrackLike | null {
  if (!video) {
    return null
  }
  const tracks = Array.from(video.textTracks ?? []) as unknown as XTextTrackLike[]
  for (const track of tracks) {
    if (CAPTION_TRACK_KINDS.has(track.kind)) {
      return track
    }
  }
  return null
}

/**
 * Poll for a captionable TextTrack on the X video element. X lazy-loads
 * caption tracks after the `<video>` is attached, so an immediate read can
 * return an empty `textTracks` list.
 */
export async function waitForXTextTrack(
  options: {
    getVideo?: () => HTMLVideoElement | null
    timeoutMs?: number
    intervalMs?: number
  } = {},
): Promise<XTextTrackLike | null> {
  const timeoutMs = options.timeoutMs ?? X_TEXTTRACKS_POLL_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? X_TEXTTRACKS_POLL_INTERVAL_MS
  const getVideo = options.getVideo
    ?? (() => document.querySelector<HTMLVideoElement>(X_VIDEO_SELECTOR))

  const deadline = Date.now() + timeoutMs
  // Probe immediately, then poll until the timeout expires. Using Date.now()
  // rather than a counter keeps the loop robust if the event loop stalls
  // (e.g. X's heavy React re-render).

  while (true) {
    const track = selectXTrack(getVideo())
    if (track) {
      return track
    }
    if (Date.now() >= deadline) {
      return null
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

export class XSubtitlesFetcher implements SubtitlesFetcher {
  private subtitles: SubtitlesFragment[] = []
  private sourceLanguage: string = ""
  private cachedTrackHash: string | null = null

  async fetch(): Promise<SubtitlesFragment[]> {
    const resolved = await this.resolveTrack()
    if (!resolved) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.noSubtitlesFound"))
    }

    const currentHash = this.buildTrackHash(resolved)
    if (this.cachedTrackHash === currentHash && this.subtitles.length > 0) {
      return this.subtitles
    }

    const cues = await this.fetchCues(resolved)
    if (cues.length === 0) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.noSubtitlesFound"))
    }

    this.sourceLanguage = resolved.language
    this.subtitles = cues
    this.cachedTrackHash = currentHash
    return this.subtitles
  }

  getSourceLanguage(): string {
    return this.sourceLanguage
  }

  cleanup(): void {
    this.subtitles = []
    this.sourceLanguage = ""
    this.cachedTrackHash = null
  }

  async hasAvailableSubtitles(): Promise<boolean> {
    const resolved = await this.resolveTrack()
    return resolved !== null
  }

  async shouldUseSameTrack(): Promise<boolean> {
    if (this.subtitles.length === 0 || !this.cachedTrackHash) {
      return false
    }
    const resolved = await this.resolveTrack()
    if (!resolved) {
      return false
    }
    return this.buildTrackHash(resolved) === this.cachedTrackHash
  }

  private buildTrackHash(resolved: XResolvedTrack): string {
    return `${resolved.tweetId}:${resolved.trackId}`
  }

  private async resolveTrack(): Promise<XResolvedTrack | null> {
    const tweetId = getXTweetId()
    if (!tweetId) {
      return null
    }

    const track = await waitForXTextTrack()
    if (!track) {
      return null
    }

    return {
      tweetId,
      trackId: track.language || track.label,
      language: track.language,
      label: track.label,
      source: track,
    }
  }

  private async fetchCues(resolved: XResolvedTrack): Promise<SubtitlesFragment[]> {
    const tt = resolved.source
    // Switching from "disabled" to "hidden" forces the browser to parse the
    // track's cues without painting native captions — which we suppress via
    // the `hideNativeSubtitles` pipeline in UniversalVideoAdapter.
    tt.mode = "hidden"
    const cues = tt.cues
    if (!cues || cues.length === 0) {
      return []
    }
    return convertXCues(cues)
  }
}
