import { db } from "./db"

/**
 * Format a Date as `YYYY-MM-DD` in the caller's local timezone. Exported
 * so tests can assert on the key and callers can preview a boundary.
 */
export function pdfPageUsageDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Atomically increment today's PDF-page counter and return the resulting
 * count. Uses a Dexie read-write transaction so two concurrent increments
 * cannot race each other to the same pre-value.
 *
 * The scheduler calls this exactly once per page that lands from the
 * provider (cache hits don't consume quota), so the count equals "fresh
 * pages translated today".
 */
export async function incrementPdfPageUsage(
  now: Date = new Date(),
): Promise<number> {
  const dateKey = pdfPageUsageDateKey(now)
  return db.transaction("rw", db.pdfTranslationUsage, async () => {
    const existing = await db.pdfTranslationUsage.get(dateKey)
    const next = (existing?.count ?? 0) + 1
    await db.pdfTranslationUsage.put({
      dateKey,
      count: next,
      updatedAt: new Date(),
    })
    return next
  })
}

/**
 * Return today's PDF-page count, or 0 if no row exists for the caller's
 * current local day.
 */
export async function getPdfPageUsage(
  now: Date = new Date(),
): Promise<number> {
  const row = await db.pdfTranslationUsage.get(pdfPageUsageDateKey(now))
  return row?.count ?? 0
}

/**
 * Test helper: wipe all PDF usage rows. Not wired to any production code path.
 */
export async function clearPdfPageUsage(): Promise<void> {
  await db.pdfTranslationUsage.clear()
}
