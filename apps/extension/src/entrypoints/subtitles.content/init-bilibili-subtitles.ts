import { BILIBILI_SPA_NAVIGATED_EVENT, BILIBILI_VIDEO_URL_PATTERN } from "@/utils/constants/subtitles"
import { setupBilibiliSubtitles } from "./platforms/bilibili"
import { bilibiliConfig } from "./platforms/bilibili/config"
import { mountSubtitlesUI } from "./renderer/mount-subtitles-ui"

/**
 * Bootstrap the Bilibili subtitles pipeline on the current tab.
 *
 * Bilibili is an SPA that navigates between videos without emitting a stable
 * custom event like YouTube's `yt-navigate-finish`. We monkey-patch
 * `history.pushState`/`replaceState` once per page to re-emit a
 * `bilibili:spa-navigated` custom event, and also listen to `popstate` for
 * back/forward navigation. On every such event `tryInit` runs; the
 * `UniversalVideoAdapter` handles per-BV reset via the same custom event wired
 * through `bilibiliConfig.events`.
 *
 * Only the new player (`.bpx-player-*`) is targeted. Live streams and the
 * legacy `#bilibili-player` page are out of scope.
 */
export function initBilibiliSubtitles() {
  let mountedAdapter: ReturnType<typeof setupBilibiliSubtitles> | null = null

  const tryInit = async () => {
    if (!BILIBILI_VIDEO_URL_PATTERN.test(window.location.pathname)) {
      return
    }

    const videoId = bilibiliConfig.getVideoId?.() ?? null
    if (!videoId) {
      return
    }

    if (!mountedAdapter) {
      mountedAdapter = setupBilibiliSubtitles()
      await mountSubtitlesUI({ adapter: mountedAdapter, config: bilibiliConfig })
      void mountedAdapter.initialize()
      return
    }

    // The adapter's own `navigateStart`/`navigateFinish` listeners (wired to
    // `bilibili:spa-navigated` in `bilibiliConfig.events`) will reset state
    // when the BV changes. Here we just ensure the button DOM is present on
    // the new page - Bilibili rebuilds `.bpx-player-control-bottom-right` on
    // every navigation.
    await mountSubtitlesUI({ adapter: mountedAdapter, config: bilibiliConfig })
  }

  patchHistoryForSpaNavigation()

  window.addEventListener(BILIBILI_SPA_NAVIGATED_EVENT, () => {
    void tryInit()
  })
  window.addEventListener("popstate", () => {
    window.dispatchEvent(new CustomEvent(BILIBILI_SPA_NAVIGATED_EVENT))
    void tryInit()
  })

  void tryInit()
}

/**
 * Monkey-patch `history.pushState` and `history.replaceState` to re-emit a
 * `bilibili:spa-navigated` custom event after each call. Idempotent per
 * window; tags the `history` object with a sentinel flag so re-injecting the
 * content script (e.g. on extension reload) is a no-op.
 */
function patchHistoryForSpaNavigation() {
  if (typeof history === "undefined") {
    return
  }
  const flag = "__getuBilibiliHistoryPatched"
  const h = history as unknown as Record<string, unknown>
  if (h[flag]) {
    return
  }
  h[flag] = true

  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  history.pushState = function (...args: Parameters<typeof originalPushState>) {
    const result = originalPushState(...args)
    window.dispatchEvent(new CustomEvent(BILIBILI_SPA_NAVIGATED_EVENT))
    return result
  }

  history.replaceState = function (...args: Parameters<typeof originalReplaceState>) {
    const result = originalReplaceState(...args)
    window.dispatchEvent(new CustomEvent(BILIBILI_SPA_NAVIGATED_EVENT))
    return result
  }
}
