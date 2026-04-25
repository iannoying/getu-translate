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
 * - `"You must add the 'storage' permission to your manifest to use 'wxt/storage'"`
 *   — WXT 0.20+ second guard inside the same `getStorageArea()`. The manifest
 *   does* declare `storage`; the message is misleading. Chromium nulls
 *   `chrome.storage` (but leaves `chrome.runtime` in a stale state) post-reload,
 *   so WXT's `browser.storage == null` branch fires. Same lifecycle root cause.
 *
 * Verified against Chromium-based browsers (Chrome, Edge, Arc) and Firefox.
 * Update if a future browser or WXT release changes the phrasing.
 */
const INVALIDATED_CONTEXT_PATTERNS = [
  "Extension context invalidated",
  "'wxt/storage' must be loaded in a web extension environment",
  "You must add the 'storage' permission to your manifest to use 'wxt/storage'",
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

let lifecycleGuardInstalled = false

/**
 * @internal
 * production code.
 */
export function __resetLifecycleGuardForTests(): void {
  lifecycleGuardInstalled = false
}

/**
 * Defense-in-depth: install a global `unhandledrejection` listener that
 * silently swallows lifecycle errors for the current execution context (a
 * content script, popup, or extension page).
 *
 * Per-call-site `.catch(swallowExtensionLifecycleError(...))` remains the
 * primary mechanism — explicit, scoped, easy to audit. This guard exists to
 * catch the long tail: third-party libraries (jotai store onMount, react-query
 * mutations, etc.) that internally fire-and-forget our wrapped `sendMessage` /
 * `storage.*` and bubble the rejection through their own machinery without
 * giving us a hook to attach `.catch` at the source.
 *
 * Idempotent — calls after the first one no-op. Real failures are NOT touched
 * (the listener delegates to `isExtensionLifecycleError` and only intercepts
 * matching messages).
 */
export function installContentScriptLifecycleGuard(scriptName: string): void {
  if (lifecycleGuardInstalled || typeof window === "undefined") {
    return
  }
  lifecycleGuardInstalled = true

  window.addEventListener("unhandledrejection", (event) => {
    if (isExtensionLifecycleError(event.reason)) {
      // Prevent the rejection from surfacing to DevTools console as
      // `Uncaught (in promise) Error: ...`. The error is expected; the
      // tab's content script just hasn't been GCed yet after extension reload.
      event.preventDefault()
      logger.info(`[${scriptName}] swallowed lifecycle rejection:`, (event.reason as Error)?.message)
    }
  })
}
