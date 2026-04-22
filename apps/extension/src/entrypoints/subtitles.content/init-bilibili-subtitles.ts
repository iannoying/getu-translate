import { setupBilibiliSubtitles } from "./platforms/bilibili"
import { bilibiliConfig } from "./platforms/bilibili/config"
import { mountSubtitlesUI } from "./renderer/mount-subtitles-ui"

/**
 * Bootstrap the Bilibili subtitles pipeline for the current tab.
 *
 * Placeholder used by `bilibiliHandler` at registration time. Task 3 wires
 * SPA navigation (history pushState/replaceState monkey-patch + popstate).
 */
export function initBilibiliSubtitles() {
  let mountedAdapter: ReturnType<typeof setupBilibiliSubtitles> | null = null

  const tryInit = async () => {
    const videoId = bilibiliConfig.getVideoId?.() ?? null
    if (!videoId) {
      return
    }

    if (!mountedAdapter) {
      mountedAdapter = setupBilibiliSubtitles()
    }

    await mountSubtitlesUI({ adapter: mountedAdapter, config: bilibiliConfig })
    void mountedAdapter.initialize()
  }

  void tryInit()
}
