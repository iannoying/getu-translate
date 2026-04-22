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
 * Test helper: drop every cached page. Not wired to production.
 */
export async function clearPdfTranslations(): Promise<void> {
  await db.pdfTranslations.clear()
}
