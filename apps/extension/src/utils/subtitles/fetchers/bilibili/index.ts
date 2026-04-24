import type { SubtitlesFragment } from "../../types"
import type { SubtitlesFetcher } from "../types"
import type {
  BilibiliResolvedTrack,
  BilibiliSubtitleTrack,
} from "./types"
import {
  BILIBILI_PLAYER_API_URL,
  BILIBILI_VIEW_API_URL,
} from "@/utils/constants/subtitles"
import { backgroundFetch } from "@/utils/content-script/background-fetch-client"
import { i18n } from "@/utils/i18n"
import { OverlaySubtitlesError } from "@/utils/subtitles/errors"
import { getBilibiliVideoId } from "@/utils/subtitles/video-id"
import {
  bilibiliPlayerV2ResponseSchema,
  bilibiliSubtitleFileSchema,
  bilibiliViewResponseSchema,
} from "./types"

/**
 * Normalize Bilibili's protocol-relative subtitle URLs to absolute https URLs.
 *
 * Bilibili returns subtitle URLs like `//aisubtitle.hdslb.com/bfs/...json` without a scheme.
 */
export function normalizeBilibiliSubtitleUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`
  }
  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`
  }
  return trimmed
}

/**
 * Read the `?p=` (page index) query param from `window.location`. 1-indexed
 * like Bilibili; returns 1 when missing or invalid.
 */
function getBilibiliPageIndex(): number {
  if (typeof window === "undefined") {
    return 1
  }
  const raw = new URLSearchParams(window.location.search).get("p")
  if (!raw) {
    return 1
  }
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

/**
 * Pick the best subtitle track for overlay translation.
 *
 * Priority:
 *   1. First non-AI-generated human subtitle (`ai_type === 0` or unset).
 *   2. AI-generated subtitles (`ai_type > 0`).
 *   3. First available track as fallback.
 */
export function selectBilibiliTrack(tracks: BilibiliSubtitleTrack[]): BilibiliSubtitleTrack | null {
  if (tracks.length === 0) {
    return null
  }

  const humanTrack = tracks.find(t => !t.ai_type)
  if (humanTrack) {
    return humanTrack
  }

  return tracks[0]
}

export class BilibiliSubtitlesFetcher implements SubtitlesFetcher {
  private subtitles: SubtitlesFragment[] = []
  private sourceLanguage: string = ""
  private cachedTrackHash: string | null = null
  private cidCache = new Map<string, number>()

  async fetch(): Promise<SubtitlesFragment[]> {
    const resolved = await this.resolveTrack()
    if (!resolved) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.noSubtitlesFound"))
    }

    const currentHash = this.buildTrackHash(resolved)
    if (currentHash && this.cachedTrackHash === currentHash && this.subtitles.length > 0) {
      return this.subtitles
    }

    const cues = await this.fetchCues(resolved.subtitleUrl)
    this.sourceLanguage = resolved.lan
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
    // Intentionally keep cidCache across cleanups - cids are stable per BV.
  }

  async hasAvailableSubtitles(): Promise<boolean> {
    try {
      const resolved = await this.resolveTrack()
      return !!resolved
    }
    catch {
      return false
    }
  }

  async shouldUseSameTrack(): Promise<boolean> {
    if (this.subtitles.length === 0 || !this.cachedTrackHash) {
      return false
    }

    try {
      const resolved = await this.resolveTrack()
      if (!resolved) {
        return false
      }
      return this.buildTrackHash(resolved) === this.cachedTrackHash
    }
    catch {
      return false
    }
  }

  private buildTrackHash(resolved: BilibiliResolvedTrack): string {
    return `${resolved.videoId}:${resolved.cid}:${resolved.lan}`
  }

  private async resolveTrack(): Promise<BilibiliResolvedTrack | null> {
    const videoId = getBilibiliVideoId()
    if (!videoId) {
      return null
    }

    const cid = await this.resolveCid(videoId)
    if (cid === null) {
      return null
    }

    const tracks = await this.fetchTracks(videoId, cid)
    const selected = selectBilibiliTrack(tracks)
    if (!selected) {
      return null
    }

    return {
      videoId,
      cid,
      lan: selected.lan,
      subtitleUrl: normalizeBilibiliSubtitleUrl(selected.subtitle_url),
    }
  }

  private async resolveCid(videoId: string): Promise<number | null> {
    const pageIndex = getBilibiliPageIndex()
    const cacheKey = `${videoId}#${pageIndex}`
    const cached = this.cidCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    const url = new URL(BILIBILI_VIEW_API_URL)
    if (videoId.startsWith("av")) {
      url.searchParams.set("aid", videoId.slice(2))
    }
    else {
      url.searchParams.set("bvid", videoId)
    }

    const response = await backgroundFetch(url.toString(), undefined, {
      credentials: "include",
    })
    if (!response.ok) {
      return null
    }

    const json = await response.json()
    const parsed = bilibiliViewResponseSchema.safeParse(json)
    if (!parsed.success || parsed.data.code !== 0 || !parsed.data.data) {
      return null
    }

    const { data } = parsed.data
    const page = data.pages[pageIndex - 1]
    const cid = page?.cid ?? data.cid
    if (!cid) {
      return null
    }

    this.cidCache.set(cacheKey, cid)
    return cid
  }

  private async fetchTracks(videoId: string, cid: number): Promise<BilibiliSubtitleTrack[]> {
    const url = new URL(BILIBILI_PLAYER_API_URL)
    if (videoId.startsWith("av")) {
      url.searchParams.set("aid", videoId.slice(2))
    }
    else {
      url.searchParams.set("bvid", videoId)
    }
    url.searchParams.set("cid", String(cid))

    const response = await backgroundFetch(url.toString(), undefined, {
      credentials: "include",
    })
    if (!response.ok) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.fetchSubTimeout"))
    }

    const json = await response.json()
    const parsed = bilibiliPlayerV2ResponseSchema.safeParse(json)
    if (!parsed.success || parsed.data.code !== 0) {
      return []
    }

    return parsed.data.data?.subtitle?.subtitles ?? []
  }

  private async fetchCues(subtitleUrl: string): Promise<SubtitlesFragment[]> {
    const response = await backgroundFetch(subtitleUrl, undefined, {
      credentials: "omit",
    })
    if (!response.ok) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.fetchSubTimeout"))
    }

    const json = await response.json()
    const parsed = bilibiliSubtitleFileSchema.safeParse(json)
    if (!parsed.success) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.noSubtitlesFound"))
    }

    return parsed.data.body.map<SubtitlesFragment>(cue => ({
      text: cue.content,
      start: Math.round(cue.from * 1000),
      end: Math.round(cue.to * 1000),
    }))
  }
}
