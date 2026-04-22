import type { PlatformHandler } from "../registry"
import { initTedSubtitles } from "../../init-ted-subtitles"

export const tedHandler: PlatformHandler = {
  kind: "ted",
  matches: hostname => /\.ted\.com$/.test(hostname) || hostname === "ted.com",
  init: initTedSubtitles,
}
