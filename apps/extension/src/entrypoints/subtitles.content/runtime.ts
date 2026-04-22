import { createPlatformRegistry } from "./platforms/registry"
import { youtubeHandler } from "./platforms/youtube/handler"

const registry = createPlatformRegistry()
registry.register(youtubeHandler)
// Future PRs register bilibiliHandler, tedHandler, xHandler here

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
