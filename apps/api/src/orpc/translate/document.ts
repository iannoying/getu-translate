import { ORPCError } from "@orpc/server"
import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { createDb } from "@getu/db"
import { schema } from "@getu/db"
import {
  documentCreateInputSchema,
  documentCreateOutputSchema,
  documentListInputSchema,
  documentListOutputSchema,
  documentStatusInputSchema,
  documentStatusOutputSchema,
} from "@getu/contract"
import { loadEntitlements } from "../../billing/entitlements"
import { authed } from "../context"
import { requireModelAccess, type Plan } from "./models"
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
    const expectedPrefix = `pdfs/${userId}/`
    if (!input.sourceKey.startsWith(expectedPrefix)) {
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

    // Atomic page-count decrement.
    const jobId = crypto.randomUUID()
    await consumeTranslateQuota(
      db,
      userId,
      "web_pdf_translate_monthly",
      input.sourcePages,
      `web-pdf:${userId}:${jobId}`,
    )

    const now = Date.now()
    const expiresAtMs = now + (plan === "free" ? FREE_PDF_RETENTION_MS : PRO_PDF_RETENTION_MS)

    await db.insert(translationJobs).values({
      id: jobId,
      userId,
      sourceKey: input.sourceKey,
      sourcePages: input.sourcePages,
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

export const documentRouter = {
  create: documentCreate,
  status: documentStatus,
  list: documentList,
}
