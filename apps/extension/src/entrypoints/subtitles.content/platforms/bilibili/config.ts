import type { PlatformConfig } from "@/entrypoints/subtitles.content/platforms"
import {
  BILIBILI_NATIVE_SUBTITLES_CLASS,
  BILIBILI_SPA_NAVIGATED_EVENT,
  DEFAULT_CONTROLS_HEIGHT,
} from "@/utils/constants/subtitles"
import { getBilibiliVideoId } from "@/utils/subtitles/video-id"

export const bilibiliConfig: PlatformConfig = {
  selectors: {
    video: ".bpx-player-video-wrap video",
    playerContainer: ".bpx-player-container",
    controlsBar: ".bpx-player-control-bottom-right",
    nativeSubtitles: BILIBILI_NATIVE_SUBTITLES_CLASS,
  },

  // Bilibili does not emit stable browser-level navigation events. The
  // init-bilibili-subtitles bootstrap patches history.pushState/replaceState
  // and re-emits this event; universal-adapter listens via navigateFinish.
  events: {
    navigateStart: BILIBILI_SPA_NAVIGATED_EVENT,
    navigateFinish: BILIBILI_SPA_NAVIGATED_EVENT,
  },

  controls: {
    measureHeight: (container) => {
      const player = container.closest(".bpx-player-container")
      const controlsBar = player?.querySelector(".bpx-player-control-wrap")
      return controlsBar?.getBoundingClientRect().height ?? DEFAULT_CONTROLS_HEIGHT
    },
    checkVisibility: (container) => {
      const player = container.closest(".bpx-player-container") as HTMLElement | null
      if (!player) {
        return false
      }
      // Bilibili hides cursor + controls via a state class on the container.
      return !player.classList.contains("bpx-state-no-cursor")
    },
  },

  getVideoId: getBilibiliVideoId,
}
