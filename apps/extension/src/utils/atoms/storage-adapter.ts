import type { ZodSchema } from "zod"
import { storage } from "#imports"
import { isNonNullish } from "@/utils/utils"
import { logger } from "../logger"

/**
 * Detects the "Extension context invalidated." error thrown by `chrome.runtime`
 * / `chrome.storage` / `browser.*` APIs after the extension is reloaded or
 * updated while a content script is still running.
 *
 * Uses message-substring match because neither Chromium nor Firefox exposes a
 * standard error subclass for this case. Verified against Chromium-based
 * browsers (Chrome, Edge, Arc) and Firefox — all emit the same canonical
 * phrasing. Update the match if a future browser diverges.
 */
export function isExtensionContextInvalidatedError(error: unknown): boolean {
  return (
    error instanceof Error
    && error.message.includes("Extension context invalidated")
  )
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

export const storageAdapter = {
  async get<T>(key: string, fallback: T, schema: ZodSchema<T>): Promise<T> {
    const value = await storage.getItem<T>(`local:${key}`)
    if (isNonNullish(value)) {
      const parsedValue = schema.safeParse(value)
      if (parsedValue.success) {
        return parsedValue.data
      }
    }
    return fallback
  },
  async set<T>(key: string, value: T, schema: ZodSchema<T>) {
    const parsedValue = schema.safeParse(value)
    if (parsedValue.success) {
      await storage.setItem(`local:${key}`, parsedValue.data)
    }
    else {
      throw new Error(parsedValue.error.message)
    }
  },
  async setMeta(key: string, meta: Record<string, unknown>) {
    await storage.setMeta(`local:${key}`, meta)
  },
  watch<T>(key: string, callback: (newValue: T) => void) {
    const unwatch = storage.watch<T>(`local:${key}`, (newValue) => {
      if (isNonNullish(newValue))
        callback(newValue)
    })
    return unwatch
  },
}
