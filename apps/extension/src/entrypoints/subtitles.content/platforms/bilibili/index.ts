import { BilibiliSubtitlesFetcher } from "@/utils/subtitles/fetchers"
import { UniversalVideoAdapter } from "../../universal-adapter"
import { bilibiliConfig } from "./config"

export function setupBilibiliSubtitles() {
  const subtitlesFetcher = new BilibiliSubtitlesFetcher()

  return new UniversalVideoAdapter({
    config: bilibiliConfig,
    subtitlesFetcher,
  })
}
