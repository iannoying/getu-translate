import { eq, and, sql } from "drizzle-orm"
import { schema } from "@getu/db"
import type { Db } from "@getu/db"
import { extractTextFromPdf } from "../translate/pdf-extract"
import { chunkParagraphs } from "../translate/document-chunker"
import { runTranslationPipeline, type TranslateChunkFn } from "../translate/document-pipeline"
import { makeTranslateChunkFn } from "../translate/document-translators"
import { renderHtml, renderMarkdown } from "../translate/document-output"
import { periodKey } from "../billing/period"
import type { WorkerEnv } from "../env"
import { logger } from "../analytics/logger"

const FAILURE_MSG_SCANNED =
  "检测到扫描件 PDF，标准翻译暂不支持，敬请期待 v2 OCR 版本"
const FAILURE_MSG_GENERIC = "翻译失败，请重试"
const FAILURE_MSG_OUTPUT = "结果保存失败，请重试或联系客服"
const FAILURE_MSG_LLM_5XX = "翻译模型暂时不可用，请稍后重试"
const FAILURE_MSG_LLM_429 = "当前翻译压力较大，请稍后重试"

export const ERROR_CODES = {
  SCANNED_PDF: "scanned_pdf",
  TRANSIENT_LLM: "transient_llm",
  R2_TIMEOUT: "r2_timeout",
  OUTPUT_WRITE: "output_write",
  GENERIC: "generic",
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const buildPdfQuotaRequestId = (userId: string, jobId: string) =>
  `web-pdf:${userId}:${jobId}`

export type CreateQueueHandlerOpts = {
  db: Db
  bucket: R2Bucket
  env: WorkerEnv
  /** Optional override for tests — replaces the real TranslateChunkFn */
  translateChunk?: TranslateChunkFn
  /** Optional override for tests — pipeline retry tuning (default: maxRetries=3, baseBackoffMs=1000) */
  pipelineOpts?: { maxRetries?: number; baseBackoffMs?: number; concurrency?: number }
}

export function createQueueHandler(opts: CreateQueueHandlerOpts) {
  const translateChunk = opts.translateChunk ?? makeTranslateChunkFn(opts.env)

  return {
    async queue(
      batch: MessageBatch<{ jobId: string }>,
      _env: WorkerEnv,
      ctx: ExecutionContext,
    ) {
      for (const msg of batch.messages) {
        try {
          await processOne(msg.body.jobId, opts, translateChunk, ctx)
        } catch (err) {
          // processOne handles its own state transitions on known failures.
          // Only reach here on truly unexpected exceptions — log and ack to
          // avoid retry loops.
          logger.error("[queue.translate-document] unexpected error", {
            jobId: msg.body.jobId,
            err,
          }, { env: opts.env, executionCtx: ctx })
        }
        msg.ack()
      }
    },
  }
}

async function processOne(
  jobId: string,
  opts: CreateQueueHandlerOpts,
  translateChunk: TranslateChunkFn,
  ctx: ExecutionContext,
): Promise<void> {
  const { db, bucket } = opts

  // 1. Load job
  const job = await db
    .select()
    .from(schema.translationJobs)
    .where(eq(schema.translationJobs.id, jobId))
    .get()

  if (!job) {
    logger.warn("[queue.translate-document] job not found", { jobId }, { env: opts.env, executionCtx: ctx })
    return
  }

  // 2. Idempotency check — skip if already past 'queued'
  if (job.status !== "queued") {
    console.info("[queue.translate-document] job not queued, skipping", {
      jobId,
      status: job.status,
    })
    return
  }

  // 3. Transition to processing
  const now = new Date()
  const claimedRows = await db
    .update(schema.translationJobs)
    .set({
      status: "processing",
      progress: JSON.stringify({ stage: "extracting", pct: 0 }),
      progressUpdatedAt: now,
    })
    .where(
      and(
        eq(schema.translationJobs.id, jobId),
        eq(schema.translationJobs.status, "queued"),
      ),
    )
    .returning({ id: schema.translationJobs.id })

  if (claimedRows.length !== 1) {
    console.info("[queue.translate-document] job claim skipped", { jobId })
    return
  }

  if (!job.sourceKey.endsWith("/source.pdf")) {
    logger.error("[queue.translate-document] unexpected sourceKey shape", {
      jobId,
      sourceKey: job.sourceKey,
    }, { env: opts.env, executionCtx: ctx })
    await fail(db, job, FAILURE_MSG_GENERIC, ERROR_CODES.GENERIC)
    await refundQuota(db, job, opts.env, ctx)
    return
  }

  const ac = new AbortController()

  try {
    // 4. Fetch source PDF from R2
    const sourceObj = await bucket.get(job.sourceKey)
    if (!sourceObj) {
      logger.warn("[queue.translate-document] source object missing", {
        jobId,
        key: job.sourceKey,
      }, { env: opts.env, executionCtx: ctx })
      await fail(db, job, FAILURE_MSG_GENERIC, ERROR_CODES.R2_TIMEOUT)
      await refundQuota(db, job, opts.env, ctx)
      return
    }
    const sourceBuf = await sourceObj.arrayBuffer()

    // 5. Extract text
    const extracted = await extractTextFromPdf(sourceBuf)

    // 6. Scanned PDF guard
    if (extracted.scanned) {
      await fail(db, job, FAILURE_MSG_SCANNED, ERROR_CODES.SCANNED_PDF)
      await refundQuota(db, job, opts.env, ctx)
      return
    }

    // 7. Chunk paragraphs
    const chunks = chunkParagraphs(extracted.pages)

    // 8. Progress writer — updates the D1 progress column at each milestone
    const writeProgress = async (p: {
      stage: string
      pct: number
      chunk?: number
      chunkTotal?: number
    }) => {
      await db
        .update(schema.translationJobs)
        .set({
          progress: JSON.stringify(p),
          progressUpdatedAt: new Date(),
        })
        .where(eq(schema.translationJobs.id, jobId))
    }

    // 9. Run translation pipeline
    const segmentsFile = await runTranslationPipeline(
      chunks,
      translateChunk,
      writeProgress,
      {
        jobId: job.id,
        modelId: job.modelId,
        sourceLang: job.sourceLang,
        targetLang: job.targetLang,
        concurrency: opts.pipelineOpts?.concurrency ?? 5,
        maxRetries: opts.pipelineOpts?.maxRetries ?? 3,
        baseBackoffMs: opts.pipelineOpts?.baseBackoffMs ?? 1000,
      },
      ac.signal,
    )

    // 10. Write segments.json to R2
    const segmentsKey = job.sourceKey.replace(/source\.pdf$/, "segments.json")
    try {
      await bucket.put(segmentsKey, JSON.stringify(segmentsFile), {
        httpMetadata: { contentType: "application/json" },
      })
    } catch (err) {
      logger.error("[queue.translate-document] R2 put failed", { jobId, err }, { env: opts.env, executionCtx: ctx })
      await fail(db, job, FAILURE_MSG_OUTPUT, ERROR_CODES.OUTPUT_WRITE)
      await refundQuota(db, job, opts.env, ctx)
      return
    }

    // 11. M6.10: render bilingual HTML + Markdown, transition to 'done'
    try {
      const htmlKey = job.sourceKey.replace(/source\.pdf$/, "output.html")
      const mdKey = job.sourceKey.replace(/source\.pdf$/, "output.md")
      const html = renderHtml(segmentsFile)
      const md = renderMarkdown(segmentsFile)
      await bucket.put(htmlKey, html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
      })
      await bucket.put(mdKey, md, {
        httpMetadata: { contentType: "text/markdown; charset=utf-8" },
      })
      await db
        .update(schema.translationJobs)
        .set({
          status: "done",
          outputHtmlKey: htmlKey,
          outputMdKey: mdKey,
          progress: null,
          progressUpdatedAt: new Date(),
        })
        .where(eq(schema.translationJobs.id, jobId))
      console.info("[queue.translate-document] job done", { jobId })
    } catch (err) {
      logger.error("[queue.translate-document] render/output failed", { jobId, err }, { env: opts.env, executionCtx: ctx })
      await fail(db, job, FAILURE_MSG_OUTPUT, ERROR_CODES.OUTPUT_WRITE)
      await refundQuota(db, job, opts.env, ctx)
      return
    }
  } catch (err) {
    // Translation pipeline failure (exhausted retries or unexpected error)
    const errMsg = pickErrorMessage(err)
    const errCode = pickErrorCode(err)
    await fail(db, job, errMsg, errCode)
    await refundQuota(db, job, opts.env, ctx)
  }
}

async function fail(
  db: Db,
  job: typeof schema.translationJobs.$inferSelect,
  errorMessage: string,
  errorCode: ErrorCode = ERROR_CODES.GENERIC,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(schema.translationJobs)
    .set({
      status: "failed",
      progress: null,
      progressUpdatedAt: now,
      errorMessage,
      errorCode,
      failedAt: now,
    })
    .where(eq(schema.translationJobs.id, job.id))
}

async function refundQuota(
  db: Db,
  job: typeof schema.translationJobs.$inferSelect,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<void> {
  const refundRequestId = `refund:${job.id}`

  // Find the original quota consumption row (requestId = web-pdf:{userId}:{jobId})
  const originalUsage = await db
    .select()
    .from(schema.usageLog)
    .where(
      and(
        eq(schema.usageLog.userId, job.userId),
        eq(schema.usageLog.requestId, buildPdfQuotaRequestId(job.userId, job.id)),
      ),
    )
    .get()

  if (!originalUsage) {
    logger.warn("[queue.translate-document] refund: no original usage row found", {
      jobId: job.id,
    }, { env, executionCtx: ctx })
    return
  }

  const now = new Date()
  const pk = periodKey(
    originalUsage.bucket as Parameters<typeof periodKey>[0],
    now,
  )

  try {
    // Idempotent negative insert (UNIQUE on userId + requestId)
    await db.insert(schema.usageLog).values({
      id: crypto.randomUUID(),
      userId: job.userId,
      bucket: originalUsage.bucket,
      amount: -originalUsage.amount,
      requestId: refundRequestId,
      createdAt: now,
    })

    // Decrement quotaPeriod.used (clamp at 0 via MAX)
    await db
      .update(schema.quotaPeriod)
      .set({
        used: sql`MAX(${schema.quotaPeriod.used} - ${originalUsage.amount}, 0)`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.quotaPeriod.userId, job.userId),
          eq(schema.quotaPeriod.bucket, originalUsage.bucket),
          eq(schema.quotaPeriod.periodKey, pk),
        ),
      )

    console.info("[queue.translate-document] quota refunded", {
      jobId: job.id,
      amount: originalUsage.amount,
    })
  } catch (err) {
    // UNIQUE constraint violation → already refunded → silent skip
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      console.info("[queue.translate-document] quota refund already applied", {
        jobId: job.id,
      })
      return
    }
    logger.error("[queue.translate-document] refund failed", {
      jobId: job.id,
      err,
    }, { env, executionCtx: ctx })
  }
}

function pickErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/\b429\b|rate.?limit/i.test(msg)) return FAILURE_MSG_LLM_429
  if (/\b5\d{2}\b|server.?error/i.test(msg)) return FAILURE_MSG_LLM_5XX
  return FAILURE_MSG_GENERIC
}

function pickErrorCode(err: unknown): ErrorCode {
  const msg = err instanceof Error ? err.message : String(err)
  if (/\b429\b|rate.?limit/i.test(msg)) return ERROR_CODES.TRANSIENT_LLM
  if (/\b5\d{2}\b|server.?error/i.test(msg)) return ERROR_CODES.TRANSIENT_LLM
  return ERROR_CODES.GENERIC
}
