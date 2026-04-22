export interface PlatformHandler {
  /** Stable identifier, used in logging + telemetry */
  readonly kind: string
  /** Test if this handler should claim the current page */
  matches: (hostname: string) => boolean
  /** Initialize the platform-specific subtitle pipeline */
  init: () => void
}

export interface PlatformRegistry {
  register: (handler: PlatformHandler) => void
  dispatch: (hostname: string) => PlatformHandler | null
  /** For tests */
  list: () => readonly PlatformHandler[]
}

export function createPlatformRegistry(): PlatformRegistry {
  const handlers: PlatformHandler[] = []
  return {
    register(handler) {
      handlers.push(handler)
    },
    dispatch(hostname) {
      return handlers.find(h => h.matches(hostname)) ?? null
    },
    list() {
      return handlers
    },
  }
}
