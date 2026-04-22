import { TedSubtitlesFetcher } from "@/utils/subtitles/fetchers"
import { UniversalVideoAdapter } from "../../universal-adapter"
import { tedConfig } from "./config"

export function setupTedSubtitles() {
  const subtitlesFetcher = new TedSubtitlesFetcher()

  return new UniversalVideoAdapter({
    config: tedConfig,
    subtitlesFetcher,
  })
}
