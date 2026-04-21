import { db } from "./db"

/**
 * Format a Date as `YYYY-MM-DD` in the caller's local timezone. Exported
 * so tests can assert on the key and callers can preview a boundary.
 */
export function formatUsageDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Atomically increment today's input-translation counter and return the
 * resulting count. Uses a Dexie read-write transaction so two concurrent
 * increments cannot race each other to the same pre-value.
 */
export async function incrementInputTranslationUsage(
  now: Date = new Date(),
): Promise<number> {
  const dateKey = formatUsageDateKey(now)
  return db.transaction("rw", db.inputTranslationUsage, async () => {
    const existing = await db.inputTranslationUsage.get(dateKey)
    const next = (existing?.count ?? 0) + 1
    await db.inputTranslationUsage.put({
      dateKey,
      count: next,
      updatedAt: new Date(),
    })
    return next
  })
}

/**
 * Return today's input-translation count, or 0 if no row exists for the
 * caller's current local day.
 */
export async function getInputTranslationUsage(
  now: Date = new Date(),
): Promise<number> {
  const row = await db.inputTranslationUsage.get(formatUsageDateKey(now))
  return row?.count ?? 0
}

/**
 * Test helper: wipe all usage rows. Not wired to any production code path.
 */
export async function clearInputTranslationUsage(): Promise<void> {
  await db.inputTranslationUsage.clear()
}
