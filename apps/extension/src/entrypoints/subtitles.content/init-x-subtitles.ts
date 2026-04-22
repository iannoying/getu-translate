import { X_SPA_NAVIGATED_EVENT, X_STATUS_URL_PATTERN } from "@/utils/constants/subtitles"
import { setupXSubtitles } from "./platforms/x"
import { xConfig } from "./platforms/x/config"
import { mountSubtitlesUI } from "./renderer/mount-subtitles-ui"

/**
 * Bootstrap the X / Twitter subtitles pipeline on the current tab.
 *
 * X is a React SPA: both `twitter.com` and `x.com` use history.pushState for
 * all navigations between tweets, profiles, and timelines. No stable custom
 * navigation event is emitted, so we monkey-patch
 * `history.pushState`/`replaceState` once per page to re-emit a
 * `x:spa-navigated` custom event, and also listen for `popstate`
 * (back/forward). `UniversalVideoAdapter` subscribes to the same event via
 * `xConfig.events`.
 *
 * Only status pages (`/{user}/status/{id}`) mount the adapter — most other
 * routes either have no video (profile grids) or embed videos we don't
 * target (explore tabs, Spaces). `waitForElement` inside the adapter will
 * silently time out if the tweet has no video.
 */
export function initXSubtitles() {
  let mountedAdapter: ReturnType<typeof setupXSubtitles> | null = null

  const tryInit = async () => {
    if (!X_STATUS_URL_PATTERN.test(window.location.pathname)) {
      return
    }

    const tweetId = xConfig.getVideoId?.() ?? null
    if (!tweetId) {
      return
    }

    if (!mountedAdapter) {
      mountedAdapter = setupXSubtitles()
      await mountSubtitlesUI({ adapter: mountedAdapter, config: xConfig })
      void mountedAdapter.initialize()
      return
    }

    // The adapter's own navigation listeners (wired to `x:spa-navigated` via
    // `xConfig.events`) reset per-tweet state. Here we only ensure the
    // translate button DOM is present on the new tweet — X rebuilds its
    // `div[role="group"]` control cluster on every status navigation.
    await mountSubtitlesUI({ adapter: mountedAdapter, config: xConfig })
  }

  patchHistoryForSpaNavigation()

  window.addEventListener(X_SPA_NAVIGATED_EVENT, () => {
    void tryInit()
  })
  window.addEventListener("popstate", () => {
    window.dispatchEvent(new CustomEvent(X_SPA_NAVIGATED_EVENT))
    void tryInit()
  })

  void tryInit()
}

/**
 * Monkey-patch `history.pushState` and `history.replaceState` to re-emit a
 * `x:spa-navigated` custom event after each call. Idempotent per window;
 * tags the `history` object with a sentinel flag so re-injecting the
 * content script (e.g. on extension reload) is a no-op.
 */
function patchHistoryForSpaNavigation() {
  if (typeof history === "undefined") {
    return
  }
  const flag = "__getuXHistoryPatched"
  const h = history as unknown as Record<string, unknown>
  if (h[flag]) {
    return
  }
  h[flag] = true

  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  history.pushState = function (...args: Parameters<typeof originalPushState>) {
    const result = originalPushState(...args)
    window.dispatchEvent(new CustomEvent(X_SPA_NAVIGATED_EVENT))
    return result
  }

  history.replaceState = function (...args: Parameters<typeof originalReplaceState>) {
    const result = originalReplaceState(...args)
    window.dispatchEvent(new CustomEvent(X_SPA_NAVIGATED_EVENT))
    return result
  }
}
