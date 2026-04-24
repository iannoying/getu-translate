import "@/utils/zod-config"
import { defineContentScript } from "#imports"
import { getLocalConfig } from "@/utils/config/storage"
import { hydrateI18nFromStorage } from "@/utils/i18n"

declare global {
  interface Window {
    __READ_FROG_SUBTITLES_INJECTED__?: boolean
  }
}

export default defineContentScript({
  matches: [
    "*://*.youtube.com/*",
    "*://*.bilibili.com/*",
    "*://*.ted.com/*",
    "*://*.twitter.com/*",
    "*://*.x.com/*",
  ],
  cssInjectionMode: "manifest",
  async main(ctx) {
    if (window.__READ_FROG_SUBTITLES_INJECTED__)
      return
    window.__READ_FROG_SUBTITLES_INJECTED__ = true

    const config = await getLocalConfig()
    if (!config?.videoSubtitles?.enabled) {
      window.__READ_FROG_SUBTITLES_INJECTED__ = false
      return
    }

    ctx.onInvalidated(() => {
      window.__READ_FROG_SUBTITLES_INJECTED__ = false
    })

    // Prime the i18n module so subtitle-UI `i18n.t()` calls resolve against
    // the user-chosen locale on first paint rather than the default detection.
    await hydrateI18nFromStorage()

    const { bootstrapSubtitlesRuntime } = await import("./runtime")
    await bootstrapSubtitlesRuntime()
  },
})
