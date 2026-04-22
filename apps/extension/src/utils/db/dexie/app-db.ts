import type { EntityTable } from "dexie"
import { upperCamelCase } from "case-anything"
import Dexie from "dexie"
import { APP_NAME } from "@/utils/constants/app"
import AiSegmentationCache from "./tables/ai-segmentation-cache"
import ArticleSummaryCache from "./tables/article-summary-cache"
import BatchRequestRecord from "./tables/batch-request-record"
import EntitlementsCache from "./tables/entitlements-cache"
import InputTranslationUsage from "./tables/input-translation-usage"
import PdfTranslationUsage from "./tables/pdf-translation-usage"
import PdfTranslations from "./tables/pdf-translations"
import TranslationCache from "./tables/translation-cache"

export default class AppDB extends Dexie {
  translationCache!: EntityTable<
    TranslationCache,
    "key"
  >

  batchRequestRecord!: EntityTable<
    BatchRequestRecord,
    "key"
  >

  articleSummaryCache!: EntityTable<
    ArticleSummaryCache,
    "key"
  >

  aiSegmentationCache!: EntityTable<
    AiSegmentationCache,
    "key"
  >

  entitlementsCache!: EntityTable<
    EntitlementsCache,
    "userId"
  >

  inputTranslationUsage!: EntityTable<
    InputTranslationUsage,
    "dateKey"
  >

  pdfTranslations!: EntityTable<
    PdfTranslations,
    "id"
  >

  pdfTranslationUsage!: EntityTable<
    PdfTranslationUsage,
    "dateKey"
  >

  constructor() {
    super(`${upperCamelCase(APP_NAME)}DB`)
    this.version(1).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
    })
    this.version(2).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
    })
    this.version(3).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
    })
    this.version(4).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
    })
    this.version(5).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
      entitlementsCache: `
        userId,
        updatedAt`,
    })
    this.version(6).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
      entitlementsCache: `
        userId,
        updatedAt`,
      inputTranslationUsage: `
        dateKey,
        updatedAt`,
    })
    this.version(7).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
      entitlementsCache: `
        userId,
        updatedAt`,
      inputTranslationUsage: `
        dateKey,
        updatedAt`,
      pdfTranslations: `
        id,
        fileHash,
        createdAt,
        lastAccessedAt`,
    })
    this.version(8).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
      entitlementsCache: `
        userId,
        updatedAt`,
      inputTranslationUsage: `
        dateKey,
        updatedAt`,
      pdfTranslations: `
        id,
        fileHash,
        createdAt,
        lastAccessedAt`,
      pdfTranslationUsage: `
        dateKey,
        updatedAt`,
    })
    // v9 (M3 follow-up · inline export): `PdfTranslationParagraph` grew an
    // optional `boundingBox` field. No index change is required — existing
    // rows stay valid and simply have `paragraphs[i].boundingBox === undefined`,
    // which the pdf-lib writer handles explicitly by falling back to the
    // footer layout for any page that lacks bbox on any paragraph.
    this.version(9).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
      entitlementsCache: `
        userId,
        updatedAt`,
      inputTranslationUsage: `
        dateKey,
        updatedAt`,
      pdfTranslations: `
        id,
        fileHash,
        createdAt,
        lastAccessedAt`,
      pdfTranslationUsage: `
        dateKey,
        updatedAt`,
    })
    this.translationCache.mapToClass(TranslationCache)
    this.batchRequestRecord.mapToClass(BatchRequestRecord)
    this.articleSummaryCache.mapToClass(ArticleSummaryCache)
    this.aiSegmentationCache.mapToClass(AiSegmentationCache)
    this.entitlementsCache.mapToClass(EntitlementsCache)
    this.inputTranslationUsage.mapToClass(InputTranslationUsage)
    this.pdfTranslations.mapToClass(PdfTranslations)
    this.pdfTranslationUsage.mapToClass(PdfTranslationUsage)
  }
}
