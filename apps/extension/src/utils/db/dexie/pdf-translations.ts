import { db } from "./db"

/**
 * Paragraph-level cache payload stored inside a page row. `srcHash` is the
 * SHA-256 of the source paragraph text so the caller can detect stale
 * content on re-extraction.
 */
export interface PdfTranslationParagraph {
  srcHash: string
  translation: string
}

/**
 * One row per `(fileHash, pageIndex, targetLang, providerId)` tuple. The
 * composite primary key is `${fileHash}:${pageIndex}` — the scheduler never
 * mixes target langs or providers within a single render session, so
 * callers wipe + re-put when the config changes.
 */
export interface PdfTranslationRow {
  id: string
  fileHash: string
  pageIndex: number
  targetLang: string
  providerId: string
  paragraphs: PdfTranslationParagraph[]
  createdAt: number
  lastAccessedAt: number
}

function buildId(fileHash: string, pageIndex: number): string {
  return `${fileHash}:${pageIndex}`
}

/**
 * Look up a cached page. Returns `null` on miss or when the stored row's
 * `targetLang` / `providerId` don't match the request (config changed since
 * the row was written).
 */
export async function getCachedPage(
  fileHash: string,
  pageIndex: number,
  targetLang: string,
  providerId: string,
): Promise<PdfTranslationRow | null> {
  const row = await db.pdfTranslations.get(buildId(fileHash, pageIndex))
  if (!row)
    return null
  if (row.targetLang !== targetLang || row.providerId !== providerId)
    return null
  return row as PdfTranslationRow
}

/**
 * Insert or replace a cached page. The caller supplies everything except
 * `lastAccessedAt`, which we stamp to `createdAt` on write so fresh rows
 * aren't immediately eligible for LRU eviction.
 */
export async function putCachedPage(
  row: Omit<PdfTranslationRow, "lastAccessedAt">,
): Promise<void> {
  await db.pdfTranslations.put({
    ...row,
    lastAccessedAt: row.createdAt,
  })
}

/**
 * Bump `lastAccessedAt` on cache hit so active pages survive LRU eviction.
 * No-op if the row is missing.
 */
export async function touchCachedPage(
  fileHash: string,
  pageIndex: number,
  now: number = Date.now(),
): Promise<void> {
  const id = buildId(fileHash, pageIndex)
  await db.transaction("rw", db.pdfTranslations, async () => {
    const existing = await db.pdfTranslations.get(id)
    if (!existing)
      return
    await db.pdfTranslations.put({
      ...existing,
      lastAccessedAt: now,
    })
  })
}

/**
 * Delete rows whose `lastAccessedAt` is older than `ttlMs` ago. Returns the
 * number of deleted rows. Called by the daily background alarm.
 */
export async function evictExpired(
  ttlMs: number,
  now: number = Date.now(),
): Promise<number> {
  const cutoff = now - ttlMs
  return db.pdfTranslations
    .where("lastAccessedAt")
    .below(cutoff)
    .delete()
}

/**
 * Delete every row for `fileHash` whose stored `(targetLang, providerId)`
 * tuple no longer matches the session's current config. Returns the number
 * of deleted rows.
 *
 * Called once from the viewer's `boot()` (M3 PR#C Task 7 follow-up) right
 * after `fileHash` is computed and before any `getCachedPage` lookup. The
 * read path (`getCachedPage`) already treats mismatched rows as misses, but
 * without this call those orphaned rows would accumulate forever — a user
 * who switches from Google to OpenAI then to Anthropic would keep the first
 * two providers' rows in Dexie until LRU eventually caught them.
 *
 * We scope the sweep to a single `fileHash` so reopening an unrelated PDF
 * in one config doesn't nuke another file's cache (the user might legit
 * re-open that other file in its original config tomorrow).
 */
export async function evictStaleConfigRows(
  fileHash: string,
  currentTargetLang: string,
  currentProviderId: string,
): Promise<number> {
  const stale = await db.pdfTranslations
    .where("fileHash")
    .equals(fileHash)
    .and(row =>
      row.targetLang !== currentTargetLang
      || row.providerId !== currentProviderId,
    )
    .toArray()
  if (stale.length === 0)
    return 0
  await db.pdfTranslations.bulkDelete(stale.map(r => r.id))
  return stale.length
}

/**
 * Test helper: drop every cached page. Not wired to production.
 */
export async function clearPdfTranslations(): Promise<void> {
  await db.pdfTranslations.clear()
}
