import { TED_TALK_URL_PATTERN } from "@/utils/constants/subtitles"
import { setupTedSubtitles } from "./platforms/ted"
import { tedConfig } from "./platforms/ted/config"
import { mountSubtitlesUI } from "./renderer/mount-subtitles-ui"

/**
 * Bootstrap the TED subtitles pipeline on the current tab.
 *
 * TED talk pages are mostly served as full page loads — no SPA event is
 * emitted when navigating between talks. We initialize once on page load
 * and also listen to `popstate` for browser back/forward.
 *
 * Only `/talks/{slug}` URLs mount the adapter; TED Ed (`/ed/...`),
 * `/playlists/...`, and conference archives are out of scope.
 */
export function initTedSubtitles() {
  let mountedAdapter: ReturnType<typeof setupTedSubtitles> | null = null
  let initialized = false

  const tryInit = async () => {
    if (!TED_TALK_URL_PATTERN.test(window.location.pathname)) {
      return
    }

    const slug = tedConfig.getVideoId?.() ?? null
    if (!slug) {
      return
    }

    if (!mountedAdapter) {
      mountedAdapter = setupTedSubtitles()
    }

    await mountSubtitlesUI({ adapter: mountedAdapter, config: tedConfig })

    if (initialized) {
      return
    }

    initialized = true
    void mountedAdapter.initialize()
  }

  window.addEventListener("popstate", () => {
    void tryInit()
  })

  void tryInit()
}
