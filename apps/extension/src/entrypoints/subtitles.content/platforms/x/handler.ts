import type { PlatformHandler } from "../registry"
import { initXSubtitles } from "../../init-x-subtitles"

/**
 * Handler for X / Twitter. Both `twitter.com` and `x.com` map to the same
 * product — X rebranded in 2023 but continues to serve content at both
 * domains. Subdomains like `mobile.x.com` are also claimed.
 */
export const xHandler: PlatformHandler = {
  kind: "x",
  matches: hostname =>
    /\.x\.com$/.test(hostname)
    || hostname === "x.com"
    || /\.twitter\.com$/.test(hostname)
    || hostname === "twitter.com",
  init: initXSubtitles,
}
