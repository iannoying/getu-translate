import type { SubtitlesFragment } from "../../types"
import type { SubtitlesFetcher } from "../types"
import type { TedCue, TedResolvedTrack } from "./types"
import {
  TED_FINAL_CUE_DURATION_MS,
  TED_TRANSCRIPT_API_BASE,
} from "@/utils/constants/subtitles"
import { backgroundFetch } from "@/utils/content-script/background-fetch-client"
import { i18n } from "@/utils/i18n"
import { OverlaySubtitlesError } from "@/utils/subtitles/errors"
import { getTedTalkSlug } from "@/utils/subtitles/video-id"
import { tedTranscriptResponseSchema } from "./types"

const DEFAULT_LANGUAGE = "en"

/**
 * Build the TED transcript JSON endpoint for a given slug + language.
 *
 * Example:
 *   buildTedTranscriptUrl("simon_sinek_how_great_leaders_inspire_action", "en")
 *   → "https://www.ted.com/talks/simon_sinek_.../transcript.json?language=en"
 */
export function buildTedTranscriptUrl(slug: string, language: string): string {
  const url = new URL(`${TED_TRANSCRIPT_API_BASE}/${slug}/transcript.json`)
  url.searchParams.set("language", language)
  return url.toString()
}

/**
 * Flatten TED's `{paragraphs: [{cues: [{time, text}]}]}` structure into a flat
 * `SubtitlesFragment[]` with derived end times.
 *
 * TED cues only include a `time` (start, milliseconds). The end of cue N is
 * derived from the start of cue N+1. The final cue uses a
 * `TED_FINAL_CUE_DURATION_MS` fallback.
 */
export function flattenTedCues(cueList: TedCue[]): SubtitlesFragment[] {
  if (cueList.length === 0) {
    return []
  }

  const results: SubtitlesFragment[] = []
  for (let i = 0; i < cueList.length; i += 1) {
    const cue = cueList[i]
    const text = cue.text.trim()
    if (!text) {
      continue
    }
    const next = cueList[i + 1]
    const end = next
      ? Math.max(cue.time + 1, next.time)
      : cue.time + TED_FINAL_CUE_DURATION_MS
    results.push({ text, start: cue.time, end })
  }

  return results
}

export class TedSubtitlesFetcher implements SubtitlesFetcher {
  private subtitles: SubtitlesFragment[] = []
  private sourceLanguage: string = ""
  private cachedTrackHash: string | null = null

  async fetch(): Promise<SubtitlesFragment[]> {
    const resolved = this.resolveTrack()
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
    const resolved = this.resolveTrack()
    if (!resolved) {
      return false
    }
    try {
      const cues = await this.fetchCues(resolved)
      return cues.length > 0
    }
    catch {
      return false
    }
  }

  async shouldUseSameTrack(): Promise<boolean> {
    if (this.subtitles.length === 0 || !this.cachedTrackHash) {
      return false
    }
    const resolved = this.resolveTrack()
    if (!resolved) {
      return false
    }
    return this.buildTrackHash(resolved) === this.cachedTrackHash
  }

  private buildTrackHash(resolved: TedResolvedTrack): string {
    return `${resolved.slug}:${resolved.language}`
  }

  private resolveTrack(): TedResolvedTrack | null {
    const slug = getTedTalkSlug()
    if (!slug) {
      return null
    }
    // M4.2 ships English-only. Multi-language follow-up tracked in plan.
    return { slug, language: DEFAULT_LANGUAGE }
  }

  private async fetchCues(resolved: TedResolvedTrack): Promise<SubtitlesFragment[]> {
    const url = buildTedTranscriptUrl(resolved.slug, resolved.language)

    const response = await backgroundFetch(url, undefined, {
      credentials: "omit",
    })
    if (response.status === 404) {
      // TED talks without transcripts return 404 — surface as "no subtitles"
      // rather than a network error.
      return []
    }
    if (!response.ok) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.fetchSubTimeout"))
    }

    const json = await response.json()
    const parsed = tedTranscriptResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new OverlaySubtitlesError(i18n.t("subtitles.errors.noSubtitlesFound"))
    }

    const flat = parsed.data.paragraphs.flatMap(p => p.cues)
    return flattenTedCues(flat)
  }
}
