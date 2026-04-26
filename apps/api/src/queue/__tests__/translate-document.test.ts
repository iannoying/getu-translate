import { describe, expect, it, vi } from "vitest"
import { createQueueHandler, buildPdfQuotaRequestId } from "../translate-document"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { schema, type Db } from "@getu/db"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { eq } from "drizzle-orm"

const __dirname = dirname(fileURLToPath(import.meta.url))

const FIXTURE_DIR = resolve(
  __dirname,
  "../../translate/__tests__/fixtures",
)

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function setupJob(
  db: ReturnType<typeof makeTestDb>["db"],
  opts: {
    jobId: string
    userId: string
    sourcePages: number
    bucket?: string
    amount?: number
  },
) {
  const { jobId, userId, sourcePages } = opts
  const bucket = opts.bucket ?? "web_pdf_translate_monthly"
  const amount = opts.amount ?? sourcePages

  // Insert user
  await db.insert(schema.user).values({
    id: userId,
    email: `${userId}@test.invalid`,
    name: userId,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // Insert translation job
  await db.insert(schema.translationJobs).values({
    id: jobId,
    userId,
    sourceKey: `pdfs/${userId}/${jobId}/source.pdf`,
    sourcePages,
    modelId: "google",
    sourceLang: "auto",
    targetLang: "zh-Hans",
    engine: "simple",
    status: "queued",
    expiresAt: new Date(Date.now() + 30 * 86400_000),
    createdAt: new Date(),
  })

  // Insert the original quota consumption row (requestId = jobId)
  // so refundQuota can find it
  const now = new Date()
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  // periodKey for monthly bucket is "YYYY-MM"
  const pk = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`

  await db.insert(schema.usageLog).values({
    id: crypto.randomUUID(),
    userId,
    bucket,
    amount,
    requestId: buildPdfQuotaRequestId(userId, jobId),
    createdAt: now,
  })

  await db.insert(schema.quotaPeriod).values({
    userId,
    bucket,
    periodKey: pk,
    used: amount,
    updatedAt: now,
  })

  return { userId, jobId, bucket, amount, pk }
}

function makeBatch(jobId: string) {
  const ack = vi.fn()
  const retry = vi.fn()
  const batch = {
    messages: [{ id: `msg-${jobId}`, body: { jobId }, ack, retry }],
  }
  return { batch, ack, retry }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("queue translate-document handler", () => {
  it("happy path: queued -> processing -> segments.json + output.html + output.md written, status=done", async () => {
    const { db } = makeTestDb()
    await setupJob(db, { jobId: "j1", userId: "u1", sourcePages: 2 })
    const pdfBuf = readFileSync(resolve(FIXTURE_DIR, "hello-world.pdf"))
    // Buffer.buffer is a shared backing ArrayBuffer — slice to get a detached copy
    // so pdfjs worker can structuredClone/transfer it without DataCloneError
    const pdfAb = pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength)

    const r2Get = vi.fn(async (key: string) =>
      key.endsWith("source.pdf")
        ? { arrayBuffer: async () => pdfAb }
        : null,
    )
    const r2Put = vi.fn(async () => undefined)

    const handler = createQueueHandler({
      db: db as unknown as Db,
      bucket: { get: r2Get, put: r2Put } as unknown as R2Bucket,
      env: {} as any,
      translateChunk: async () => "你好",
    })

    const { batch, ack } = makeBatch("j1")
    await handler.queue(batch as any, {} as any, {} as any)

    // R2 put called three times: segments.json, output.html, output.md
    expect(r2Put).toHaveBeenCalledTimes(3)
    const putKeys = r2Put.mock.calls.map((c) => (c as unknown[])[0] as string)
    expect(putKeys).toContain("pdfs/u1/j1/segments.json")
    expect(putKeys).toContain("pdfs/u1/j1/output.html")
    expect(putKeys).toContain("pdfs/u1/j1/output.md")

    // Message acked
    expect(ack).toHaveBeenCalled()

    // Job status = done, progress = null, outputHtmlKey + outputMdKey set
    const job = await db
      .select()
      .from(schema.translationJobs)
      .where(eq(schema.translationJobs.id, "j1"))
      .get()
    expect(job?.status).toBe("done")
    expect(job?.progress).toBeNull()
    expect(job?.outputHtmlKey).toBe("pdfs/u1/j1/output.html")
    expect(job?.outputMdKey).toBe("pdfs/u1/j1/output.md")
  })

  it("scanned PDF: status=failed with canonical message + quota refunded", async () => {
    const { db } = makeTestDb()
    const ctx = await setupJob(db, { jobId: "j2", userId: "u2", sourcePages: 1 })
    const scannedBuf = readFileSync(resolve(FIXTURE_DIR, "scanned-image.pdf"))
    const scannedAb = scannedBuf.buffer.slice(scannedBuf.byteOffset, scannedBuf.byteOffset + scannedBuf.byteLength)

    const handler = createQueueHandler({
      db: db as unknown as Db,
      bucket: {
        get: vi.fn(async () => ({ arrayBuffer: async () => scannedAb })),
        put: vi.fn(),
      } as unknown as R2Bucket,
      env: {} as any,
      translateChunk: async () => { throw new Error("should not be called") },
    })

    const { batch, ack } = makeBatch("j2")
    await handler.queue(batch as any, {} as any, {} as any)

    expect(ack).toHaveBeenCalled()

    const job = await db
      .select()
      .from(schema.translationJobs)
      .where(eq(schema.translationJobs.id, "j2"))
      .get()
    expect(job?.status).toBe("failed")
    expect(job?.errorMessage).toMatch(/扫描件/)

    // Refund row has negative amount
    const refunds = await db
      .select()
      .from(schema.usageLog)
      .where(eq(schema.usageLog.requestId, "refund:j2"))
      .all()
    expect(refunds.length).toBe(1)
    expect(refunds[0].amount).toBe(-ctx.amount)
  })

  it("R2 source missing: status=failed with generic message", async () => {
    const { db } = makeTestDb()
    await setupJob(db, { jobId: "j3", userId: "u3", sourcePages: 1 })

    const handler = createQueueHandler({
      db: db as unknown as Db,
      bucket: {
        get: vi.fn(async () => null),
        put: vi.fn(),
      } as unknown as R2Bucket,
      env: {} as any,
    })

    const { batch, ack } = makeBatch("j3")
    await handler.queue(batch as any, {} as any, {} as any)

    expect(ack).toHaveBeenCalled()

    const job = await db
      .select()
      .from(schema.translationJobs)
      .where(eq(schema.translationJobs.id, "j3"))
      .get()
    expect(job?.status).toBe("failed")
    expect(job?.errorMessage).toBe("翻译失败，请重试")
  })

  it("translateChunk throws 503 after retries: status=failed + canonical LLM 5xx message + refunded", async () => {
    const { db } = makeTestDb()
    const ctx = await setupJob(db, { jobId: "j4", userId: "u4", sourcePages: 1 })
    const pdfBuf = readFileSync(resolve(FIXTURE_DIR, "hello-world.pdf"))
    const pdfAb = pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength)

    const handler = createQueueHandler({
      db: db as unknown as Db,
      bucket: {
        get: vi.fn(async () => ({ arrayBuffer: async () => pdfAb })),
        put: vi.fn(),
      } as unknown as R2Bucket,
      env: {} as any,
      // 0ms backoff and 1 retry so the test completes instantly
      pipelineOpts: { maxRetries: 1, baseBackoffMs: 0 },
      translateChunk: async () => {
        throw new Error("503 server error")
      },
    })

    const { batch, ack } = makeBatch("j4")
    await handler.queue(batch as any, {} as any, {} as any)

    expect(ack).toHaveBeenCalled()

    const job = await db
      .select()
      .from(schema.translationJobs)
      .where(eq(schema.translationJobs.id, "j4"))
      .get()
    expect(job?.status).toBe("failed")
    expect(job?.errorMessage).toBe("翻译模型暂时不可用，请稍后重试")

    // Refund row exists
    const refunds = await db
      .select()
      .from(schema.usageLog)
      .where(eq(schema.usageLog.requestId, "refund:j4"))
      .all()
    expect(refunds.length).toBe(1)
    expect(refunds[0].amount).toBe(-ctx.amount)
  })

  it("malformed sourceKey -> fails without overwriting", async () => {
    const { db } = makeTestDb()
    await setupJob(db, { jobId: "j-bad", userId: "u-bad", sourcePages: 1 })
    // Mutate the row to a malformed sourceKey
    await db
      .update(schema.translationJobs)
      .set({ sourceKey: "pdfs/u-bad/j-bad/document.pdf" })
      .where(eq(schema.translationJobs.id, "j-bad"))

    const r2Put = vi.fn()
    const handler = createQueueHandler({
      db: db as unknown as Db,
      bucket: {
        get: vi.fn(async () => ({ arrayBuffer: async () => readFileSync(resolve(FIXTURE_DIR, "hello-world.pdf")).buffer })),
        put: r2Put,
      } as unknown as R2Bucket,
      env: {} as any,
      translateChunk: async () => "你好",
    })

    const { batch } = makeBatch("j-bad")
    await handler.queue(batch as any, {} as any, {} as any)

    // segments.json should NOT have been written
    const putKeys = r2Put.mock.calls.map((c) => c[0] as string)
    expect(putKeys).not.toContain("pdfs/u-bad/j-bad/document.pdf")

    const [job] = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-bad"))
    expect(job.status).toBe("failed")
  })

  it("renderer/R2 output write failure -> failed + refund", async () => {
    const { db } = makeTestDb()
    await setupJob(db, { jobId: "j-out", userId: "u-out", sourcePages: 1 })
    const pdfBuf = readFileSync(resolve(FIXTURE_DIR, "hello-world.pdf"))
    const pdfAb = pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength)

    let putCount = 0
    const r2Put = vi.fn(async () => {
      putCount++
      if (putCount === 2) throw new Error("R2 write failed for output.html")
      // segments.json (call 1) succeeds; output.html (call 2) throws
    })

    const handler = createQueueHandler({
      db: db as unknown as Db,
      bucket: {
        get: vi.fn(async () => ({ arrayBuffer: async () => pdfAb })),
        put: r2Put,
      } as unknown as R2Bucket,
      env: {} as any,
      translateChunk: async () => "你好",
    })

    const batch = { messages: [{ id: "m-out", body: { jobId: "j-out" }, ack: vi.fn(), retry: vi.fn() }] }
    await handler.queue(batch as any, {} as any, {} as any)

    const [job] = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-out"))
    expect(job.status).toBe("failed")
    expect(job.errorMessage).toMatch(/结果保存失败/)

    // Refund row exists
    const refunds = await db
      .select()
      .from(schema.usageLog)
      .where(eq(schema.usageLog.requestId, "refund:j-out"))
      .all()
    expect(refunds.length).toBe(1)
    expect(refunds[0].amount).toBe(-1)
  })

  it("idempotent: skips processing when status is already done", async () => {
    const { db } = makeTestDb()
    await setupJob(db, { jobId: "j5", userId: "u5", sourcePages: 1 })
    await db
      .update(schema.translationJobs)
      .set({ status: "done" })
      .where(eq(schema.translationJobs.id, "j5"))

    const r2Get = vi.fn()
    const r2Put = vi.fn()
    const handler = createQueueHandler({
      db: db as unknown as Db,
      bucket: { get: r2Get, put: r2Put } as unknown as R2Bucket,
      env: {} as any,
    })

    const { batch, ack } = makeBatch("j5")
    await handler.queue(batch as any, {} as any, {} as any)

    // No R2 access — skipped immediately
    expect(r2Get).not.toHaveBeenCalled()
    expect(r2Put).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalled()
  })
})
