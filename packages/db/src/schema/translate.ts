import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { user } from "./auth"

const unixMsDefault = sql`(CAST(unixepoch('now','subsec') * 1000 AS INTEGER))`

/**
 * Per-translate-click history row.
 *
 * One row per "translate" button press on the web /translate page. The full
 * input text and every model column's result are persisted so the history
 * drawer can fully restore a past translation without re-spending quota or
 * hitting any provider API. `results` is a JSON-serialized
 * `Record<TranslateModelId, { text: string } | { error: string }>`. SQLite
 * has no `jsonb`; callers MUST `JSON.stringify` on write and `JSON.parse` on
 * read.
 *
 * Free users only have entries for `google` and `microsoft` keys (Pro LLM
 * columns rendered an upgrade prompt and never sent a request).
 *
 * Retention: see `expires_at`. Free → 30 days; Pro → null (永久). The
 * scheduled cleanup worker (#M6.12) honors this column.
 */
export const textTranslations = sqliteTable(
  "text_translations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceText: text("source_text").notNull(),
    sourceLang: text("source_lang").notNull(),
    targetLang: text("target_lang").notNull(),
    /** JSON-serialized `Record<TranslateModelId, { text } | { error }>`. */
    results: text("results").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(unixMsDefault),
    /** Null = retain forever (Pro tier). Set to a future timestamp for free tier. */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  },
  t => ({
    byUserCreated: index("text_translations_user_created_idx").on(t.userId, t.createdAt),
    byExpires: index("text_translations_expires_idx").on(t.expiresAt),
  }),
)

/**
 * PDF translation job. Async pipeline:
 *   queued → processing → done | failed
 *
 * `engine` discriminates the C-path "simple" pipeline (text extraction +
 * paragraph translation, MVP) from the future "babeldoc" pipeline (layout-
 * preserving). Default 'simple' for M6 MVP.
 *
 * `progress` is JSON-serialized `{ stage: string; pct: number }` updated by
 * the queue consumer roughly every 25%.
 *
 * R2 layout (see #M6.8):
 *   pdfs/{id}/source.pdf
 *   pdfs/{id}/output.html
 *   pdfs/{id}/output.md
 *
 * Retention: 30 days (free) / 90 days (pro). The scheduled cleanup worker
 * deletes both the DB row and the R2 objects when `expires_at` lapses.
 */
export const translationJobs = sqliteTable(
  "translation_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    sourcePages: integer("source_pages").notNull(),
    sourceFilename: text("source_filename"),
    sourceBytes: integer("source_bytes"),
    outputHtmlKey: text("output_html_key"),
    outputMdKey: text("output_md_key"),
    modelId: text("model_id").notNull(),
    sourceLang: text("source_lang").notNull(),
    targetLang: text("target_lang").notNull(),
    status: text("status", {
      enum: ["queued", "processing", "done", "failed"],
    })
      .notNull()
      .default("queued"),
    engine: text("engine", { enum: ["simple", "babeldoc"] })
      .notNull()
      .default("simple"),
    /** JSON-serialized `{ stage: string; pct: number }`. Null until first update. */
    progress: text("progress"),
    errorMessage: text("error_message"),
    /** M6.12: Categorical failure code for retry routing. See ERROR_CODES in translate-document.ts. */
    errorCode: text("error_code"),
    /** M6.12: Timestamp (ms) when the job transitioned to failed. Null for non-failed jobs. */
    failedAt: integer("failed_at", { mode: "timestamp_ms" }),
    /** M6.12: Number of times the auto-retry sweeper has re-queued this job. */
    retriedCount: integer("retried_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(unixMsDefault),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  t => ({
    byUserCreated: index("translation_jobs_user_created_idx").on(t.userId, t.createdAt),
    byStatus: index("translation_jobs_status_idx").on(t.status, t.createdAt),
    byExpires: index("translation_jobs_expires_idx").on(t.expiresAt),
    uqOneActivePdfPerUser: uniqueIndex("uq_one_active_pdf_per_user")
      .on(t.userId)
      .where(sql`status IN ('queued', 'processing')`),
  }),
)
