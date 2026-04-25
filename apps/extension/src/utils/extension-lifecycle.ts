import { logger } from "./logger"

/**
 * Browser-emitted error message strings that all signal "the extension lifecycle
 * was interrupted (reload / update / unload) while existing scripts were still
 * running." Each entry is a substring matched against `error.message`.
 *
 * - `"Extension context invalidated"` — canonical Chromium / Firefox runtime
 *   error after the extension is reloaded while a content script is still alive.
 * - `"'wxt/storage' must be loaded in a web extension environment"` — WXT 0.20+
 *   guard inside `getStorageArea()` that fires once `browser.runtime` becomes
 *   `null` post-reload. Same root cause as above, different surface.
 *
 * Verified against Chromium-based browsers (Chrome, Edge, Arc) and Firefox.
 * Update if a future browser or WXT release changes the phrasing.
 */
const INVALIDATED_CONTEXT_PATTERNS = [
  "Extension context invalidated",
  "'wxt/storage' must be loaded in a web extension environment",
] as const

/**
 * Browser-emitted messaging errors that signal "the receiver is unreachable
 * right now." This happens after extension reload (the old background went
 * away) AND in healthy operation when the target tab simply has no listener
 * (chrome:// pages, tabs without content scripts, freshly opened tabs).
 *
 * The healthy-operation case is normally not a bug — fire-and-forget
 * background→tab broadcasts intentionally tolerate it. Treating these
 * messages as lifecycle noise is therefore safe for fire-and-forget paths
 * but should NOT be applied to awaited calls whose caller relies on the
 * error to detect a real failure.
 */
const MESSAGING_DISCONNECT_PATTERNS = [
  "Could not establish connection",
  "The message port closed before a response was received",
] as const

/**
 * `true` when the error is the "Extension context invalidated" family
 * (raw Chromium message OR WXT 0.20+ storage guard re-throw).
 */
export function isExtensionContextInvalidatedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return INVALIDATED_CONTEXT_PATTERNS.some(pattern => error.message.includes(pattern))
}

/**
 * `true` when the error is the "Could not establish connection" family. Use
 * only on fire-and-forget messaging paths — awaited callers that need to
 * distinguish "no receiver" from "real RPC failure" should not pre-swallow.
 */
export function isMessagingDisconnectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return MESSAGING_DISCONNECT_PATTERNS.some(pattern => error.message.includes(pattern))
}

/**
 * Union matcher: any error that means "the extension lifecycle made this call
 * fail" — either context invalidation or messaging disconnect. Use at fire-
 * and-forget call sites that bridge into background or storage.
 */
export function isExtensionLifecycleError(error: unknown): boolean {
  return isExtensionContextInvalidatedError(error) || isMessagingDisconnectError(error)
}

/**
 * Returns a `.catch` handler suitable for fire-and-forget storage reads on
 * content-script lifecycle boundaries (atom `onMount`, visibility change).
 * Silently swallows errors triggered by extension reload; logs real failures
 * through the shared logger so they remain visible during development.
 *
 * @param context Human-readable identifier shown in logs (e.g. `"configAtom initial"`).
 */
export function swallowInvalidatedStorageRead(context: string) {
  return (error: unknown) => {
    if (isExtensionContextInvalidatedError(error)) {
      return
    }
    logger.error(`${context} storage read failed:`, error)
  }
}

/**
 * Returns a `.catch` handler for fire-and-forget messaging or mixed
 * storage+messaging paths. Swallows both context-invalidation AND
 * receiver-missing errors silently; logs anything else.
 *
 * Use over `swallowInvalidatedStorageRead` whenever the call site touches
 * `sendMessage` or otherwise depends on the runtime port (e.g. atom onMount
 * that pulls state from background, background→tab notifications, etc.).
 *
 * @param context Human-readable identifier shown in logs.
 */
export function swallowExtensionLifecycleError(context: string) {
  return (error: unknown) => {
    if (isExtensionLifecycleError(error)) {
      return
    }
    logger.error(`${context} failed:`, error)
  }
}
