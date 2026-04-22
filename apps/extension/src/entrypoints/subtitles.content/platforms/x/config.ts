import type { PlatformConfig } from "@/entrypoints/subtitles.content/platforms"
import {
  DEFAULT_CONTROLS_HEIGHT,
  X_NATIVE_SUBTITLES_CLASS,
  X_SPA_NAVIGATED_EVENT,
} from "@/utils/constants/subtitles"
import { getXTweetId } from "@/utils/subtitles/video-id"

/**
 * X / Twitter status page player configuration.
 *
 * TO VERIFY (manual smoke test on twitter.com/{user}/status/{id} and
 * x.com/{user}/status/{id} with a captioned video):
 * - X renders inline videos inside `div[data-testid="videoComponent"]`.
 * - Controls are a React-managed cluster; historically rendered under the
 *   same `videoComponent` via `div[role="group"]`.
 * - Native caption overlay is a separate div sibling of the <video>
 *   (X renders captions itself rather than relying on `::cue`).
 *
 * If X's DOM shifts (data-testid renames), `waitForElement` inside the
 * adapter will time out silently and no overlay mounts — safer than throwing.
 */
export const xConfig: PlatformConfig = {
  selectors: {
    video: "div[data-testid=\"videoComponent\"] video",
    playerContainer: "div[data-testid=\"videoComponent\"]",
    controlsBar: "div[data-testid=\"videoComponent\"] div[role=\"group\"]",
    nativeSubtitles: X_NATIVE_SUBTITLES_CLASS,
  },

  // X is a React SPA (both twitter.com and x.com). `init-x-subtitles` patches
  // `history.pushState`/`replaceState` to emit this event. The adapter wires
  // it to navigateStart/Finish so per-tweet resets happen on every
  // tweet-to-tweet navigation.
  events: {
    navigateStart: X_SPA_NAVIGATED_EVENT,
    navigateFinish: X_SPA_NAVIGATED_EVENT,
  },

  controls: {
    measureHeight: (container) => {
      const player = container.closest("div[data-testid=\"videoComponent\"]")
      const controlsBar = player?.querySelector("div[role=\"group\"]")
      return controlsBar?.getBoundingClientRect().height ?? DEFAULT_CONTROLS_HEIGHT
    },
    checkVisibility: (container) => {
      // X shows controls on hover; without a stable "idle" class we fall back
      // to "assume visible" so the overlay never permanently hides.
      const player = container.closest("div[data-testid=\"videoComponent\"]") as HTMLElement | null
      return !!player
    },
  },

  getVideoId: getXTweetId,
}
