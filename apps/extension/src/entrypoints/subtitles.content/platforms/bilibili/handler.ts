import type { PlatformHandler } from "../registry"
import { initBilibiliSubtitles } from "../../init-bilibili-subtitles"

export const bilibiliHandler: PlatformHandler = {
  kind: "bilibili",
  matches: hostname => /\.bilibili\.com$/.test(hostname) || hostname === "bilibili.com",
  init: initBilibiliSubtitles,
}
