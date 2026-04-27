import { ORPCError } from "@orpc/server"
import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { AwsClient } from "aws4fetch"
import { createDb } from "@getu/db"
import { schema } from "@getu/db"
import {
  documentCreateInputSchema,
  documentCreateOutputSchema,
  documentDownloadUrlInputSchema,
  documentDownloadUrlOutputSchema,
  documentListInputSchema,
  documentListOutputSchema,
  documentRetryInputSchema,
  documentRetryOutputSchema,
  documentStatusInputSchema,
  documentStatusOutputSchema,
  TRANSLATE_DOCUMENT_MAX_BYTES,
  TRANSLATE_DOCUMENT_MAX_PAGES,
} from "@getu/contract"
import { loadEntitlements } from "../../billing/entitlements"
import { readPdfPageCount } from "../../translate/document"
import { authed } from "../context"
import { requireModelAccess, type Plan } from "./models"
import type { TranslateModelId } from "@getu/definitions"
import { consumeTranslateQuota } from "./quota"

const { translationJobs } = schema

const FREE_PDF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const PRO_PDF_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

function resolvePlan(tier: string | undefined): Plan {
  if (tier === "pro" || tier === "enterprise") return tier
  return "free"
}

/**
 * Create a PDF translation job. The caller has already direct-uploaded the
 * source bytes to R2 at `sourceKey` and read the page count via PDF.js.
 *
 * M6.3 SKELETON: this only inserts the row with status='queued'. Cloudflare
 * Queue dispatch lands in M6.9 (consumer worker pulls these rows).
 *
 * Atomic page-count quota: free user with 8 remaining pages and a 12-page
 * PDF is rejected outright — `consumeQuota` raises `INSUFFICIENT_QUOTA`.
 *
 * Concurrency cap: each user may have ≤ 1 active job at a time (queued or
 * processing). Second concurrent upload returns `CONFLICT`.
 */
export const documentCreate = authed
  .input(documentCreateInputSchema)
  .output(documentCreateOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    const ent = await loadEntitlements(db, userId, context.env.BILLING_ENABLED === "true")
    const plan = resolvePlan(ent.tier)

    // Model gating mirrors text translation: free → google/microsoft only.
    const modelId = requireModelAccess(plan, input.modelId)

    // Ownership: sourceKey is supplied by the client after a presigned R2
    // upload (see #M6.8). Enforce that the key lives under this user's
    // namespace so a malicious caller can't queue a job against another
    // user's PDF and burn their own quota processing it.
    //
    // R2/S3 object keys are opaque — they DO NOT auto-normalize `..` —
    // so a raw startsWith check can be bypassed by `pdfs/u-free/../other/x.pdf`.
    // We must (a) reject any key containing path-traversal segments, then
    // (b) verify the prefix.
    const expectedPrefix = `pdfs/${userId}/`
    const segments = input.sourceKey.split("/")
    const hasTraversal = segments.some(seg => seg === "" || seg === "." || seg === "..")
    if (hasTraversal || !input.sourceKey.startsWith(expectedPrefix)) {
      throw new ORPCError("FORBIDDEN", {
        message: "sourceKey 不在用户命名空间内",
        data: { code: "SOURCE_KEY_OUT_OF_SCOPE", expectedPrefix },
      })
    }

    // Concurrency: one PDF in-flight per user.
    const active = await db
      .select({ id: translationJobs.id })
      .from(translationJobs)
      .where(
        and(
          eq(translationJobs.userId, userId),
          inArray(translationJobs.status, ["queued", "processing"]),
        ),
      )
      .limit(1)
      .all()
    if (active.length > 0) {
      throw new ORPCError("CONFLICT", {
        message: "已有 PDF 翻译任务正在进行，请等其完成后再上传",
        data: { code: "PDF_JOB_INFLIGHT", existingJobId: active[0].id },
      })
    }

    // Server-side page count: pull the uploaded PDF from R2 and parse its
    // metadata. This overrides the client-supplied `sourcePages` so a
    // malicious client can't fudge a 200-page PDF as "1 page" to skip the
    // quota check. Falls back to client value when BUCKET_PDFS isn't bound
    // (dev / vitest with no R2 binding) — defensive only, prod always has it.
    let pages = input.sourcePages
    const bucket = context.env.BUCKET_PDFS
    if (bucket) {
      const obj = await bucket.get(input.sourceKey)
      if (!obj) {
        throw new ORPCError("BAD_REQUEST", {
          message: "未找到上传的 PDF — 请先完成上传，再调用 documentCreate",
          data: { code: "SOURCE_NOT_FOUND" },
        })
      }
      if (obj.size > TRANSLATE_DOCUMENT_MAX_BYTES) {
        throw new ORPCError("BAD_REQUEST", {
          message: `PDF 大小 ${obj.size} 超过 ${TRANSLATE_DOCUMENT_MAX_BYTES} 上限`,
          data: { code: "TOO_LARGE", limit: TRANSLATE_DOCUMENT_MAX_BYTES, actual: obj.size },
        })
      }
      const buf = await obj.arrayBuffer()
      try {
        pages = await readPdfPageCount(new Uint8Array(buf))
      } catch (err) {
        const code = (err as { code?: string }).code ?? "SCANNED_PDF"
        throw new ORPCError("BAD_REQUEST", {
          message: "无法读取 PDF 页数（可能是扫描件或加密文件）",
          data: { code },
        })
      }
      if (pages > TRANSLATE_DOCUMENT_MAX_PAGES) {
        throw new ORPCError("BAD_REQUEST", {
          message: `PDF 页数 ${pages} 超过 ${TRANSLATE_DOCUMENT_MAX_PAGES} 上限`,
          data: { code: "TOO_MANY_PAGES", limit: TRANSLATE_DOCUMENT_MAX_PAGES, actual: pages },
        })
      }
    } else {
      // Dev fallback only — log so ops can spot it, never silently in prod.
      console.warn("[documentCreate] BUCKET_PDFS missing — trusting client sourcePages (dev)")
    }

    const jobId = crypto.randomUUID()
    const now = Date.now()
    const expiresAtMs = now + (plan === "free" ? FREE_PDF_RETENTION_MS : PRO_PDF_RETENTION_MS)

    // INSERT first — the UNIQUE partial index on (user_id) for active jobs is
    // the authoritative race winner. Both legs of a double-fire pass the
    // SELECT check above, but only one INSERT wins; the loser sees a UNIQUE
    // constraint error and gets a clean CONFLICT without consuming any quota.
    try {
      await db.insert(translationJobs).values({
        id: jobId,
        userId,
        sourceKey: input.sourceKey,
        sourcePages: pages,
        sourceFilename: input.sourceFilename ?? null,
        sourceBytes: input.sourceBytes,
        modelId,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        status: "queued",
        engine: "simple",
        createdAt: new Date(now),
        expiresAt: new Date(expiresAtMs),
      })
    } catch (err) {
      const msg = (err as { message?: string }).message ?? ""
      if (msg.includes("UNIQUE constraint failed: translation_jobs.user_id")) {
        throw new ORPCError("CONFLICT", {
          message: "已有 PDF 翻译任务正在进行，请等其完成后再上传",
          data: { code: "PDF_JOB_INFLIGHT" },
        })
      }
      throw err
    }

    // Only the INSERT winner reaches here. Consume quota now.
    // If quota is exhausted, roll back the INSERT so the user isn't stuck
    // with a phantom in-flight row blocking their next attempt.
    try {
      await consumeTranslateQuota(
        db,
        userId,
        "web_pdf_translate_monthly",
        pages,
        `web-pdf:${userId}:${jobId}`,
      )
    } catch (err) {
      // Best-effort rollback: if DELETE fails, log and still re-throw the
      // quota error. The retention worker will eventually clean the orphan.
      try {
        await db.delete(translationJobs)
          .where(and(eq(translationJobs.id, jobId), eq(translationJobs.userId, userId)))
          .run()
      } catch (delErr) {
        console.warn("[documentCreate] failed to rollback job row after quota failure", delErr)
      }
      throw err
    }

    // Cloudflare Queue dispatch — consumer worker (M6.9) drains this and
    // flips status queued → processing → done. Optional binding so dev
    // without queues set up degrades to "row stays in queued forever".
    if (context.env.TRANSLATE_QUEUE) {
      await context.env.TRANSLATE_QUEUE.send({ jobId })
    } else {
      console.warn("[documentCreate] TRANSLATE_QUEUE missing — job will not auto-start")
    }

    return { jobId }
  })

export const documentStatus = authed
  .input(documentStatusInputSchema)
  .output(documentStatusOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    const row = await db
      .select()
      .from(translationJobs)
      .where(and(eq(translationJobs.id, input.jobId), eq(translationJobs.userId, userId)))
      .get()
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "translation job not found" })
    }

    let progress: { stage: string; pct: number } | null = null
    if (row.progress) {
      try {
        const parsed = JSON.parse(row.progress) as unknown
        if (parsed && typeof parsed === "object" && "stage" in parsed && "pct" in parsed) {
          progress = parsed as { stage: string; pct: number }
        }
      } catch {
        progress = null
      }
    }

    return {
      jobId: row.id,
      status: row.status,
      progress,
      outputHtmlKey: row.outputHtmlKey ?? null,
      outputMdKey: row.outputMdKey ?? null,
      errorMessage: row.errorMessage ?? null,
    }
  })

export const documentList = authed
  .input(documentListInputSchema)
  .output(documentListOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    const cursorMs = input.cursor ? Number.parseInt(input.cursor, 10) : Number.POSITIVE_INFINITY
    if (Number.isNaN(cursorMs)) {
      throw new ORPCError("BAD_REQUEST", { message: "cursor must be a unix-ms integer" })
    }

    const rows = await db
      .select()
      .from(translationJobs)
      .where(
        and(
          eq(translationJobs.userId, userId),
          lt(
            translationJobs.createdAt,
            cursorMs === Number.POSITIVE_INFINITY ? new Date(8.64e15) : new Date(cursorMs),
          ),
        ),
      )
      .orderBy(desc(translationJobs.createdAt))
      .limit(input.limit + 1)
      .all()

    const items = rows.slice(0, input.limit).map(row => ({
      id: row.id,
      sourceFilename: row.sourceFilename ?? null,
      sourcePages: row.sourcePages,
      modelId: row.modelId,
      sourceLang: row.sourceLang,
      targetLang: row.targetLang,
      status: row.status,
      engine: row.engine,
      createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as number)).toISOString(),
      expiresAt: (row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt as number)).toISOString(),
    }))

    const last = rows[input.limit]
    const nextCursor = last
      ? String((last.createdAt instanceof Date ? last.createdAt : new Date(last.createdAt as number)).getTime())
      : undefined

    return { items, nextCursor }
  })

export const documentDownloadUrl = authed
  .input(documentDownloadUrlInputSchema)
  .output(documentDownloadUrlOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id
    const job = await db
      .select()
      .from(translationJobs)
      .where(and(eq(translationJobs.id, input.jobId), eq(translationJobs.userId, userId)))
      .get()
    if (!job) throw new ORPCError("NOT_FOUND", { message: "Job not found" })
    if (job.status !== "done") throw new ORPCError("BAD_REQUEST", { message: "Job not yet complete" })
    const key = input.format === "html" ? job.outputHtmlKey : job.outputMdKey
    if (!key) throw new ORPCError("NOT_FOUND", { message: "Output not available" })

    const env = context.env
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_PDFS_NAME) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "R2 credentials not configured" })
    }

    const expiresInSec = 3600
    const aws = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    })
    const objectUrl = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_PDFS_NAME}/${key}`
    const signed = await aws.sign(
      new Request(`${objectUrl}?X-Amz-Expires=${expiresInSec}`, { method: "GET" }),
      { aws: { signQuery: true } },
    )

    return {
      url: signed.url,
      expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    }
  })

export const documentRetry = authed
  .input(documentRetryInputSchema)
  .output(documentRetryOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id
    const origJob = await db
      .select()
      .from(translationJobs)
      .where(and(eq(translationJobs.id, input.jobId), eq(translationJobs.userId, userId)))
      .get()
    if (!origJob) throw new ORPCError("NOT_FOUND", { message: "Job not found" })
    if (origJob.status !== "failed") {
      throw new ORPCError("BAD_REQUEST", { message: "Only failed jobs can be retried" })
    }

    const ent = await loadEntitlements(db, userId, context.env.BILLING_ENABLED === "true")
    const plan = resolvePlan(ent.tier)
    requireModelAccess(plan, origJob.modelId as TranslateModelId)

    const activeRows = await db
      .select({ id: translationJobs.id })
      .from(translationJobs)
      .where(
        and(
          eq(translationJobs.userId, userId),
          inArray(translationJobs.status, ["queued", "processing"]),
        ),
      )
      .limit(1)
      .all()
    if (activeRows.length > 0) {
      throw new ORPCError("CONFLICT", { message: "Another translation is already in progress" })
    }

    const newJobId = crypto.randomUUID()
    const expiresAt = new Date(
      Date.now() + (plan === "free" ? FREE_PDF_RETENTION_MS : PRO_PDF_RETENTION_MS),
    )

    try {
      await db.insert(translationJobs).values({
        id: newJobId,
        userId,
        sourceKey: origJob.sourceKey,
        sourcePages: origJob.sourcePages,
        sourceFilename: origJob.sourceFilename,
        sourceBytes: origJob.sourceBytes,
        modelId: origJob.modelId,
        sourceLang: origJob.sourceLang,
        targetLang: origJob.targetLang,
        engine: "simple",
        status: "queued",
        expiresAt,
        createdAt: new Date(),
      })
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new ORPCError("CONFLICT", { message: "Another translation is already in progress" })
      }
      throw err
    }

    try {
      await consumeTranslateQuota(
        db,
        userId,
        "web_pdf_translate_monthly",
        origJob.sourcePages,
        `web-pdf:${userId}:${newJobId}`,
      )
    } catch (err) {
      await db.delete(translationJobs).where(eq(translationJobs.id, newJobId)).run()
      throw err
    }

    if (context.env.TRANSLATE_QUEUE) {
      await context.env.TRANSLATE_QUEUE.send({ jobId: newJobId })
    }

    return { jobId: newJobId }
  })

export const documentRouter = {
  create: documentCreate,
  status: documentStatus,
  list: documentList,
  downloadUrl: documentDownloadUrl,
  retry: documentRetry,
}
