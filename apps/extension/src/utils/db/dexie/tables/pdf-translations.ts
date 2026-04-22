import { Entity } from "dexie"

/**
 * Paragraph-level bounding box in PDF units (y grows upward). Duplicated
 * intentionally from `@/entrypoints/pdf-viewer/paragraph/types` to avoid a
 * reverse dependency from the Dexie layer (db → pdf-viewer). The shape is
 * trivial (four numbers) and both definitions must stay in sync.
 *
 * Populated by the pdf-viewer at translate time so the Pro export layer can
 * draw each translation directly beneath its source paragraph. Legacy rows
 * written before M3 follow-up Task 2 lack this field on every paragraph,
 * and the exporter falls back to its footer layout for such pages.
 */
interface CachedBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

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
 * `boundingBox` is optional: introduced in schema v9 (M3 follow-up) so the
 * inline bilingual exporter can draw translations under their source
 * paragraph. Rows written under v8 keep `boundingBox === undefined`; the
 * exporter reads it with a `!bbox` check and falls back to the legacy
 * footer layout when any paragraph on a page lacks it.
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
  paragraphs!: Array<{
    srcHash: string
    translation: string
    boundingBox?: CachedBoundingBox
  }>

  createdAt!: number
  lastAccessedAt!: number
}
