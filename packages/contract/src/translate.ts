import { oc } from "@orpc/contract"
import { z } from "zod"

/**
 * Web /translate & /document oRPC contracts (M6).
 *
 * Schemas live in `@getu/contract` so the web client (Next.js) and the
 * worker handler (Hono) share the same input/output shape — the worker is
 * the source of truth for behavior, the contract is the source of truth
 * for types.
 *
 * Char limits, model access, and quota are enforced *server-side* in
 * `apps/api/src/orpc/translate/*`. Client-side validation is best-effort UX.
 */

// ---- shared ----

const langCodeSchema = z.string().min(2).max(16)
const modelIdSchema = z.string().min(1).max(64)
/** Stable column id from the client (Jotai atom key). */
const columnIdSchema = z.string().min(1).max(64)

// ---- text translation ----

/**
 * Hard cap that the API will *always* reject above, regardless of plan.
 * Per-plan caps (free 2000 / pro 20000) live in the handler, not the schema —
 * we still want to reject 1MB inputs at the parse layer for safety.
 */
export const TRANSLATE_TEXT_MAX_CHARS = 50_000

/**
 * Per-button-press identifier shared by every column issued from one click.
 * The server uses it as `consumeQuota`'s requestId so 11 concurrent column
 * calls collapse to exactly **one** monthly-bucket decrement (idempotency
 * key). The client must generate a fresh value via `crypto.randomUUID()`
 * **once per Translate-button click** and pass the same value to every
 * column's call.
 *
 * Format is enforced as RFC 4122 UUID (v4 or v7) so a careless or
 * adversarial client can't reuse a constant string like `"00000000"` and
 * skip quota decrements on subsequent legitimate clicks.
 */
const clickIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "clickId must be a UUID (use crypto.randomUUID() per Translate click)",
  )

export const translateTextInputSchema = z
  .object({
    text: z.string().min(1).max(TRANSLATE_TEXT_MAX_CHARS),
    sourceLang: langCodeSchema,
    targetLang: langCodeSchema,
    modelId: modelIdSchema,
    columnId: columnIdSchema,
    clickId: clickIdSchema,
  })
  .strict()
export type TranslateTextInput = z.infer<typeof translateTextInputSchema>

export const translateTextOutputSchema = z
  .object({
    columnId: columnIdSchema,
    modelId: modelIdSchema,
    text: z.string(),
    /** Tokens consumed (LLM models only; null for translate-api like google/microsoft). */
    tokens: z
      .object({
        input: z.number().int().nonnegative(),
        output: z.number().int().nonnegative(),
      })
      .nullable(),
  })
  .strict()
export type TranslateTextOutput = z.infer<typeof translateTextOutputSchema>

// ---- text translation history ----

export const historyResultEntrySchema = z.union([
  z.object({ text: z.string() }).strict(),
  z.object({ error: z.string() }).strict(),
])
export type HistoryResultEntry = z.infer<typeof historyResultEntrySchema>

/** Reusable: the persisted `text_translations.results` JSON shape. */
export const historyResultsSchema = z.record(z.string(), historyResultEntrySchema)

export const saveHistoryInputSchema = z
  .object({
    sourceText: z.string().min(1).max(TRANSLATE_TEXT_MAX_CHARS),
    sourceLang: langCodeSchema,
    targetLang: langCodeSchema,
    /** modelId → { text } | { error } */
    results: z.record(modelIdSchema, historyResultEntrySchema),
  })
  .strict()
export type SaveHistoryInput = z.infer<typeof saveHistoryInputSchema>

export const saveHistoryOutputSchema = z
  .object({
    id: z.string(),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict()
export type SaveHistoryOutput = z.infer<typeof saveHistoryOutputSchema>

export const listHistoryInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .strict()

export const listHistoryItemSchema = z
  .object({
    id: z.string(),
    sourceText: z.string(),
    sourceLang: langCodeSchema,
    targetLang: langCodeSchema,
    results: z.record(modelIdSchema, historyResultEntrySchema),
    createdAt: z.string().datetime(),
  })
  .strict()
export type ListHistoryItem = z.infer<typeof listHistoryItemSchema>

export const listHistoryOutputSchema = z
  .object({
    items: z.array(listHistoryItemSchema),
    nextCursor: z.string().optional(),
  })
  .strict()

// ---- history mutations ----

export const deleteHistoryInputSchema = z.object({ id: z.string().min(1) }).strict()
export type DeleteHistoryInput = z.infer<typeof deleteHistoryInputSchema>

export const deleteHistoryOutputSchema = z
  .object({ deleted: z.boolean() })
  .strict()
export type DeleteHistoryOutput = z.infer<typeof deleteHistoryOutputSchema>

export const clearHistoryInputSchema = z.object({}).strict()
export const clearHistoryOutputSchema = z
  .object({ deletedCount: z.number().int().nonnegative() })
  .strict()
export type ClearHistoryOutput = z.infer<typeof clearHistoryOutputSchema>

// ---- document translation ----

export const TRANSLATE_DOCUMENT_MAX_PAGES = 200
export const TRANSLATE_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024

export const translationJobStatusSchema = z.enum(["queued", "processing", "done", "failed"])
export type TranslationJobStatus = z.infer<typeof translationJobStatusSchema>

export const translationJobEngineSchema = z.enum(["simple", "babeldoc"])
export type TranslationJobEngine = z.infer<typeof translationJobEngineSchema>

export const documentCreateInputSchema = z
  .object({
    /** R2 key written by the multipart upload step (front-end uploads first, then calls this). */
    sourceKey: z.string().min(1),
    sourcePages: z.number().int().min(1).max(TRANSLATE_DOCUMENT_MAX_PAGES),
    sourceFilename: z.string().max(512).optional(),
    sourceBytes: z.number().int().min(1).max(TRANSLATE_DOCUMENT_MAX_BYTES),
    modelId: modelIdSchema,
    sourceLang: langCodeSchema,
    targetLang: langCodeSchema,
  })
  .strict()
export type DocumentCreateInput = z.infer<typeof documentCreateInputSchema>

export const documentCreateOutputSchema = z
  .object({
    jobId: z.string(),
  })
  .strict()
export type DocumentCreateOutput = z.infer<typeof documentCreateOutputSchema>

export const documentStatusInputSchema = z.object({ jobId: z.string() }).strict()

export const documentStatusOutputSchema = z
  .object({
    jobId: z.string(),
    status: translationJobStatusSchema,
    /** Optional progress payload, JSON-shaped `{ stage, pct }`. */
    progress: z
      .object({
        stage: z.string(),
        pct: z.number().min(0).max(100),
      })
      .nullable(),
    outputHtmlKey: z.string().nullable(),
    outputMdKey: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict()
export type DocumentStatusOutput = z.infer<typeof documentStatusOutputSchema>

export const documentListInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .strict()

export const documentListItemSchema = z
  .object({
    id: z.string(),
    sourceFilename: z.string().nullable(),
    sourcePages: z.number().int(),
    modelId: modelIdSchema,
    sourceLang: langCodeSchema,
    targetLang: langCodeSchema,
    status: translationJobStatusSchema,
    engine: translationJobEngineSchema,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict()
export type DocumentListItem = z.infer<typeof documentListItemSchema>

export const documentListOutputSchema = z
  .object({
    items: z.array(documentListItemSchema),
    nextCursor: z.string().optional(),
  })
  .strict()

// ---- oRPC contract ----

/**
 * Web /translate & /document oRPC contract. The server (`apps/api`) implements
 * each procedure; the web client (`apps/web`) consumes them via
 * `orpcClient.translate.*` typed against this contract.
 */
export const translateContract = oc.router({
  translate: oc.input(translateTextInputSchema).output(translateTextOutputSchema),
  saveHistory: oc.input(saveHistoryInputSchema).output(saveHistoryOutputSchema),
  listHistory: oc.input(listHistoryInputSchema).output(listHistoryOutputSchema),
  deleteHistory: oc.input(deleteHistoryInputSchema).output(deleteHistoryOutputSchema),
  clearHistory: oc.input(clearHistoryInputSchema).output(clearHistoryOutputSchema),
  document: oc.router({
    create: oc.input(documentCreateInputSchema).output(documentCreateOutputSchema),
    status: oc.input(documentStatusInputSchema).output(documentStatusOutputSchema),
    list: oc.input(documentListInputSchema).output(documentListOutputSchema),
  }),
})
