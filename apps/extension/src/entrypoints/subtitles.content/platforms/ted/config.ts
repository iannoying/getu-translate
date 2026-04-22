import type { PlatformConfig } from "@/entrypoints/subtitles.content/platforms"
import {
  DEFAULT_CONTROLS_HEIGHT,
  TED_NATIVE_SUBTITLES_CLASS,
} from "@/utils/constants/subtitles"
import { getTedTalkSlug } from "@/utils/subtitles/video-id"

/**
 * TED talk page player configuration.
 *
 * TO VERIFY (manual smoke test on www.ted.com/talks/{slug}):
 * - TED uses a React player; exact class names may shift. The selectors below
 *   target the most stable structural hooks observed as of late 2025.
 * - `playerContainer`: the TED player is wrapped in a div that carries
 *   `[class*="media-player"]`; fallback to `[data-testid="video-player"]`.
 * - `controlsBar`: TED's right-aligned control cluster; we match any element
 *   whose class contains "controls" within the player container.
 * - `nativeSubtitles`: TED renders its own captions overlay; we hide it so
 *   our overlay is the only visible layer.
 *
 * If TED's DOM changes and any of these miss, `mount-subtitles-ui` will
 * short-circuit gracefully (it waits for the video element and retries on
 * navigation events).
 */
export const tedConfig: PlatformConfig = {
  selectors: {
    video: "video",
    playerContainer: "[class*=\"media-player\"], [data-testid=\"video-player\"]",
    controlsBar: "[class*=\"media-player\"] [class*=\"controls\"]",
    nativeSubtitles: TED_NATIVE_SUBTITLES_CLASS,
  },

  // TED pages are mostly full navigations — no SPA events are required, but we
  // still declare `popstate` for back/forward so UniversalVideoAdapter picks
  // up navigations without a full reload.
  events: {
    navigateStart: "popstate",
    navigateFinish: "popstate",
  },

  controls: {
    measureHeight: (container) => {
      const player = container.closest("[class*=\"media-player\"]")
        ?? container.closest("[data-testid=\"video-player\"]")
      const controlsBar = player?.querySelector("[class*=\"controls\"]")
      return controlsBar?.getBoundingClientRect().height ?? DEFAULT_CONTROLS_HEIGHT
    },
    checkVisibility: (container) => {
      // TED's controls are always rendered; visibility tracks a "hidden" class
      // on the player. When we cannot identify the state, assume visible so
      // overlay never permanently hides.
      const player = container.closest("[class*=\"media-player\"]") as HTMLElement | null
        ?? container.closest("[data-testid=\"video-player\"]") as HTMLElement | null
      if (!player) {
        return true
      }
      return !player.classList.contains("media-player--idle")
    },
  },

  getVideoId: getTedTalkSlug,
}
