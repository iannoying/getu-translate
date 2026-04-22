/**
 * Minimal structural subset of `VTTCue` used by the fetcher. The native
 * `VTTCue` type isn't always present in TypeScript's DOM lib (it ships with
 * the `dom-iterable` lib but can be missing in stricter configs), so we
 * declare the shape we actually consume.
 */
export interface XVttCueLike {
  startTime: number
  endTime: number
  text: string
}

/**
 * Minimal structural subset of `TextTrack` used by the fetcher. We only
 * touch `mode`, `cues`, `kind`, `language`, and `label`.
 */
export interface XTextTrackLike {
  kind: string
  language: string
  label: string
  mode: "disabled" | "hidden" | "showing"
  readonly cues: ArrayLike<XVttCueLike> | null
}

export interface XResolvedTrack {
  tweetId: string
  trackId: string
  language: string
  label: string
  source: XTextTrackLike
}
