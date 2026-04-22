import type { PlatformHandler } from "../registry"
import { initYoutubeSubtitles } from "../../init-youtube-subtitles"

export const youtubeHandler: PlatformHandler = {
  kind: "youtube",
  matches: hostname => /\.youtube\.com$/.test(hostname) || hostname === "youtube.com",
  init: initYoutubeSubtitles,
}
