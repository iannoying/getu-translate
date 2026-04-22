import { bilibiliHandler } from "./platforms/bilibili/handler"
import { createPlatformRegistry } from "./platforms/registry"
import { tedHandler } from "./platforms/ted/handler"
import { youtubeHandler } from "./platforms/youtube/handler"

const registry = createPlatformRegistry()
registry.register(youtubeHandler)
registry.register(bilibiliHandler)
registry.register(tedHandler)
// Future PRs register xHandler here

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
