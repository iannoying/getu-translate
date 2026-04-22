import { Entity } from "dexie"

/**
 * Cached per-page PDF translation. Keyed by `${fileHash}:${pageIndex}` so
 * a single PDF produces one row per page. The cache is scoped by
 * `targetLang` and `providerId`: switching either triggers a miss.
 *
 * `paragraphs` stores a content-addressed map of source text to translation.
 * Each entry's `srcHash` is SHA-256 of the source paragraph, so if the PDF's
 * text extraction changes (e.g. OCR rerun) individual paragraph invalidation
 * is possible — though B3 treats any paragraph mismatch as a page-level miss.
 *
 * `lastAccessedAt` is indexed for LRU eviction; the daily alarm deletes rows
 * older than 30 days by this timestamp.
 */
export default class PdfTranslations extends Entity {
  id!: string
  fileHash!: string
  pageIndex!: number
  targetLang!: string
  providerId!: string
  paragraphs!: Array<{ srcHash: string, translation: string }>
  createdAt!: number
  lastAccessedAt!: number
}
