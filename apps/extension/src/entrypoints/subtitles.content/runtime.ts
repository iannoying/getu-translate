import { bilibiliHandler } from "./platforms/bilibili/handler"
import { createPlatformRegistry } from "./platforms/registry"
import { youtubeHandler } from "./platforms/youtube/handler"

const registry = createPlatformRegistry()
registry.register(youtubeHandler)
registry.register(bilibiliHandler)
// Future PRs register tedHandler, xHandler here

let hasBootstrappedSubtitlesRuntime = false

export function bootstrapSubtitlesRuntime() {
  if (hasBootstrappedSubtitlesRuntime) {
    return
  }

  hasBootstrappedSubtitlesRuntime = true

  const handler = registry.dispatch(window.location.hostname)
  if (!handler) {
    return
  }
  handler.init()
}

// Export registry for tests + future PR platform registrations
export { registry as subtitlesPlatformRegistry }
