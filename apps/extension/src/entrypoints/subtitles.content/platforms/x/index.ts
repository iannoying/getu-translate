import { XSubtitlesFetcher } from "@/utils/subtitles/fetchers"
import { UniversalVideoAdapter } from "../../universal-adapter"
import { xConfig } from "./config"

export function setupXSubtitles() {
  const subtitlesFetcher = new XSubtitlesFetcher()

  return new UniversalVideoAdapter({
    config: xConfig,
    subtitlesFetcher,
  })
}
