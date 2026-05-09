import { ORPCError } from "@orpc/server"
import { createRouterClient } from "@orpc/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@getu/contract"
import type { Ctx } from "../context"
import { router } from "../index"

vi.mock("@getu/db", async (orig) => {
  const actual = await orig<typeof import("@getu/db")>()
  return { ...actual, createDb: vi.fn(() => fakeDb) }
})
vi.mock("../../billing/entitlements", () => ({
  loadEntitlements: vi.fn(async () => FREE_ENTITLEMENTS),
}))
vi.mock("../translate/quota", () => ({
  consumeTranslateQuota: vi.fn(async () => undefined),
}))

// Mock aws4fetch so signing is deterministic in tests
vi.mock("aws4fetch", () => {
  class AwsClient {
    async sign(req: Request) {
      const url = req.url + "&X-Amz-Signature=fakesig"
      return { url }
    }
  }
  return { AwsClient }
})

// ---- fakeDb state ----
let pendingJobRow: Record<string, unknown> | null = null
let pendingActiveJobs: { id: string }[] = []
let insertedJobs: Record<string, unknown>[] = []
let usageLogRows: Record<string, unknown>[] = []
let deletedIds: string[] = []
let updatedQuotaPeriods: Record<string, unknown>[] = []

function tableName(table: unknown): string {
  const direct = (table as any)?._?.name ?? (table as any)?.[Symbol.for("drizzle:Name")]
  if (direct) return direct
  const symbol = Object.getOwnPropertySymbols(table as object)
    .find(sym => sym.description === "drizzle:Name")
  return symbol ? String((table as any)[symbol]) : ""
}

const fakeDb = {
  insert: vi.fn((table?: unknown) => ({
    values: vi.fn(async (row: Record<string, unknown>) => {
      if (tableName(table) === "usage_log") {
        usageLogRows.push(row)
      } else {
        insertedJobs.push(row)
      }
    }),
  })),
  select: vi.fn((..._cols: unknown[]) => ({
    from: vi.fn((table?: unknown) => ({
      where: vi.fn((..._args: unknown[]) => ({
        get: async () => {
          if (tableName(table) === "usage_log") return usageLogRows[0] ?? undefined
          return pendingJobRow ?? undefined
        },
        limit: vi.fn(() => ({
          all: async () => pendingActiveJobs,
        })),
        all: async () => pendingActiveJobs,
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({ all: async () => [] })),
        })),
      })),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn((_arg: unknown) => ({
      run: async () => {
        const ids = insertedJobs.map(job => job.id).filter((id): id is string => typeof id === "string")
        deletedIds.push(...ids)
        insertedJobs = []
      },
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(async (_arg: unknown) => {
        updatedQuotaPeriods.push(values)
      }),
    })),
  })),
}

function ctx(session: Ctx["session"], envOverrides: Partial<Ctx["env"]> = {}): Ctx {
  return {
    env: { DB: {} as any, BILLING_ENABLED: "false", ...envOverrides } as Ctx["env"],
    auth: {} as Ctx["auth"],
    session,
  }
}

const freeSession = { user: { id: "u-free", email: "f@x" }, session: { id: "s1" } } as any
const otherSession = { user: { id: "u-other", email: "o@x" }, session: { id: "s2" } } as any

const R2_ENV = {
  R2_ACCOUNT_ID: "acc123",
  R2_ACCESS_KEY_ID: "key123",
  R2_SECRET_ACCESS_KEY: "secret123",
  R2_BUCKET_PDFS_NAME: "my-bucket",
}

const doneJob = {
  id: "job-done",
  userId: "u-free",
  status: "done",
  outputHtmlKey: "pdfs/u-free/job-done/output.html",
  outputMdKey: "pdfs/u-free/job-done/output.md",
  sourceKey: "pdfs/u-free/job-done/source.pdf",
  sourcePages: 5,
  sourceFilename: "test.pdf",
  sourceBytes: 100_000,
  modelId: "google",
  sourceLang: "en",
  targetLang: "zh-CN",
  engine: "simple",
  errorMessage: null,
  progress: null,
  createdAt: new Date("2026-05-09T00:00:00.000Z"),
  expiresAt: new Date("2026-06-08T00:00:00.000Z"),
}

const failedJob = {
  ...doneJob,
  id: "job-failed",
  status: "failed",
  outputHtmlKey: null,
  outputMdKey: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  pendingJobRow = null
  pendingActiveJobs = []
  insertedJobs = []
  usageLogRows = []
  deletedIds = []
  updatedQuotaPeriods = []
})

// ---- documentDownloadUrl ----

describe("translate.document.downloadUrl", () => {
  it("returns signed URL for done job + html format", async () => {
    pendingJobRow = doneJob
    const client = createRouterClient(router, {
      context: ctx(freeSession, R2_ENV),
    })
    const out = await client.translate.document.downloadUrl({ jobId: "job-done", format: "html" })
    expect(out.url).toContain("my-bucket")
    expect(out.url).toContain("X-Amz-Signature")
    expect(out.expiresAt).toBeTruthy()
    // expiresAt should be ~1h in the future
    const expiresMs = new Date(out.expiresAt).getTime()
    expect(expiresMs).toBeGreaterThan(Date.now() + 3500 * 1000)
    expect(expiresMs).toBeLessThan(Date.now() + 3700 * 1000)
  })

  it("returns signed URL for done job + md format", async () => {
    pendingJobRow = doneJob
    const client = createRouterClient(router, {
      context: ctx(freeSession, R2_ENV),
    })
    const out = await client.translate.document.downloadUrl({ jobId: "job-done", format: "md" })
    expect(out.url).toContain("output.md")
    expect(out.url).toContain("X-Amz-Signature")
  })

  it("rejects NOT_FOUND for missing job", async () => {
    pendingJobRow = null
    const client = createRouterClient(router, {
      context: ctx(freeSession, R2_ENV),
    })
    await expect(
      client.translate.document.downloadUrl({ jobId: "nonexistent", format: "html" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rejects NOT_FOUND when job belongs to another user", async () => {
    // otherSession queries with their own userId — fakeDb returns null (job not found for them)
    pendingJobRow = null
    const client = createRouterClient(router, {
      context: ctx(otherSession, R2_ENV),
    })
    await expect(
      client.translate.document.downloadUrl({ jobId: "job-done", format: "html" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rejects BAD_REQUEST when status != done", async () => {
    pendingJobRow = { ...doneJob, status: "processing" }
    const client = createRouterClient(router, {
      context: ctx(freeSession, R2_ENV),
    })
    await expect(
      client.translate.document.downloadUrl({ jobId: "job-done", format: "html" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects NOT_FOUND when outputHtmlKey is null", async () => {
    pendingJobRow = { ...doneJob, outputHtmlKey: null }
    const client = createRouterClient(router, {
      context: ctx(freeSession, R2_ENV),
    })
    await expect(
      client.translate.document.downloadUrl({ jobId: "job-done", format: "html" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rejects NOT_FOUND when outputMdKey is null", async () => {
    pendingJobRow = { ...doneJob, outputMdKey: null }
    const client = createRouterClient(router, {
      context: ctx(freeSession, R2_ENV),
    })
    await expect(
      client.translate.document.downloadUrl({ jobId: "job-done", format: "md" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rejects INTERNAL_SERVER_ERROR when R2 creds missing", async () => {
    pendingJobRow = doneJob
    const client = createRouterClient(router, {
      context: ctx(freeSession, {}), // no R2 env vars
    })
    await expect(
      client.translate.document.downloadUrl({ jobId: "job-done", format: "html" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
  })
})

describe("translate.document.preview", () => {
  it("returns signed source, segments, html, and md URLs for a done job", async () => {
    pendingJobRow = doneJob
    const bucket = { head: vi.fn(async () => ({ size: 1 })) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { ...R2_ENV, BUCKET_PDFS: bucket as any }),
    })
    const out = await client.translate.document.preview({ jobId: "job-done" })
    expect(out.job).toMatchObject({
      id: "job-done",
      sourceFilename: "test.pdf",
      sourcePages: 5,
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
      status: "done",
      engine: "simple",
    })
    expect(out.sourcePdfUrl).toContain("source.pdf")
    expect(out.segmentsJsonUrl).toContain("segments.json")
    expect(out.htmlUrl).toContain("output.html")
    expect(out.mdUrl).toContain("output.md")
    expect(out.sourcePdfUrl).toContain("X-Amz-Signature")
    expect(bucket.head).toHaveBeenCalledWith("pdfs/u-free/job-done/source.pdf")
    expect(bucket.head).toHaveBeenCalledWith("pdfs/u-free/job-done/segments.json")
  })

  it("rejects BAD_REQUEST when preview job is not done", async () => {
    pendingJobRow = { ...doneJob, status: "processing" }
    const client = createRouterClient(router, { context: ctx(freeSession, R2_ENV) })
    await expect(client.translate.document.preview({ jobId: "job-done" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects NOT_FOUND when source or segments asset is missing", async () => {
    pendingJobRow = doneJob
    const bucket = { head: vi.fn(async (key: string) => key.endsWith("source.pdf") ? { size: 1 } : null) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { ...R2_ENV, BUCKET_PDFS: bucket as any }),
    })
    await expect(client.translate.document.preview({ jobId: "job-done" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("returns null for optional outputs missing from R2", async () => {
    pendingJobRow = doneJob
    const bucket = {
      head: vi.fn(async (key: string) => {
        if (key.endsWith("output.html")) return null
        return { size: 1 }
      }),
    }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { ...R2_ENV, BUCKET_PDFS: bucket as any }),
    })

    const out = await client.translate.document.preview({ jobId: "job-done" })

    expect(out.htmlUrl).toBeNull()
    expect(out.mdUrl).toContain("output.md")
    expect(bucket.head).toHaveBeenCalledWith("pdfs/u-free/job-done/output.html")
    expect(bucket.head).toHaveBeenCalledWith("pdfs/u-free/job-done/output.md")
  })
})

// ---- documentRetry ----

describe("translate.document.retry", () => {
  it("creates new job from same source, status=queued, returns new jobId", async () => {
    pendingJobRow = failedJob
    pendingActiveJobs = []
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.retry({ jobId: "job-failed" })
    expect(out.jobId).toBeTruthy()
    expect(out.jobId).not.toBe("job-failed")
    expect(insertedJobs).toHaveLength(1)
    expect(insertedJobs[0]).toMatchObject({
      userId: "u-free",
      sourceKey: failedJob.sourceKey,
      sourcePages: failedJob.sourcePages,
      modelId: failedJob.modelId,
      sourceLang: failedJob.sourceLang,
      targetLang: failedJob.targetLang,
      status: "queued",
      engine: "simple",
    })
    // expiresAt should be set
    expect(insertedJobs[0]?.expiresAt).toBeInstanceOf(Date)
  })

  it("rejects NOT_FOUND for missing job", async () => {
    pendingJobRow = null
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.retry({ jobId: "nonexistent" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rejects NOT_FOUND for cross-user (job not visible to other user)", async () => {
    pendingJobRow = null
    const client = createRouterClient(router, { context: ctx(otherSession) })
    await expect(
      client.translate.document.retry({ jobId: "job-failed" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rejects BAD_REQUEST when original status is not failed", async () => {
    pendingJobRow = { ...failedJob, status: "done" }
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.retry({ jobId: "job-failed" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects CONFLICT when user has active job", async () => {
    pendingJobRow = failedJob
    pendingActiveJobs = [{ id: "active-job" }]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.retry({ jobId: "job-failed" }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("enqueues new job onto TRANSLATE_QUEUE", async () => {
    pendingJobRow = failedJob
    pendingActiveJobs = []
    const queue = { send: vi.fn(async () => undefined) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { TRANSLATE_QUEUE: queue as any }),
    })
    const out = await client.translate.document.retry({ jobId: "job-failed" })
    expect(queue.send).toHaveBeenCalledTimes(1)
    expect(queue.send).toHaveBeenCalledWith({ jobId: out.jobId })
  })

  it("consumes quota with new web-pdf:{userId}:{newJobId} requestId", async () => {
    pendingJobRow = failedJob
    pendingActiveJobs = []
    const translateQuota = await import("../translate/quota")
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.retry({ jobId: "job-failed" })
    expect(translateQuota.consumeTranslateQuota).toHaveBeenCalledTimes(1)
    const [, calledUserId, calledBucket, calledPages, calledRequestId] = (translateQuota.consumeTranslateQuota as any).mock.calls[0]
    expect(calledUserId).toBe("u-free")
    expect(calledBucket).toBe("web_pdf_translate_monthly")
    expect(calledPages).toBe(failedJob.sourcePages)
    expect(calledRequestId).toBe(`web-pdf:u-free:${out.jobId}`)
  })

  it("rejects NOT_FOUND when source.pdf has been deleted from R2", async () => {
    pendingJobRow = failedJob
    pendingActiveJobs = []
    const bucket = { head: vi.fn(async () => null), get: vi.fn(async () => null) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { BUCKET_PDFS: bucket as any }),
    })
    await expect(
      client.translate.document.retry({ jobId: "job-failed" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: expect.stringContaining("源文件") })
    expect(bucket.head).toHaveBeenCalledWith(failedJob.sourceKey)
  })
})

describe("translate.document.retranslate", () => {
  it("creates a new queued job from a done source job with new settings", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = []
    const bucket = { head: vi.fn(async () => ({ size: 1 })) }
    const queue = { send: vi.fn(async () => undefined) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { BUCKET_PDFS: bucket as any, TRANSLATE_QUEUE: queue as any }),
    })

    const out = await client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "microsoft",
      sourceLang: "en",
      targetLang: "zh-TW",
    })

    expect(out.jobId).toBeTruthy()
    expect(out.jobId).not.toBe("job-done")
    expect(insertedJobs[0]).toMatchObject({
      userId: "u-free",
      sourceKey: doneJob.sourceKey,
      sourcePages: doneJob.sourcePages,
      sourceFilename: doneJob.sourceFilename,
      sourceBytes: doneJob.sourceBytes,
      modelId: "microsoft",
      sourceLang: "en",
      targetLang: "zh-TW",
      status: "queued",
      engine: "simple",
    })
    expect(queue.send).toHaveBeenCalledWith({ jobId: out.jobId })
    expect(bucket.head).toHaveBeenCalledWith(doneJob.sourceKey)
  })

  it("consumes quota for retranslation using the new job id", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = []
    const translateQuota = await import("../translate/quota")
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })
    const [, calledUserId, calledBucket, calledPages, calledRequestId] =
      (translateQuota.consumeTranslateQuota as any).mock.calls[0]
    expect(calledUserId).toBe("u-free")
    expect(calledBucket).toBe("web_pdf_translate_monthly")
    expect(calledPages).toBe(doneJob.sourcePages)
    expect(calledRequestId).toBe(`web-pdf:u-free:${out.jobId}`)
  })

  it("rejects CONFLICT when another PDF job is active", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = [{ id: "active-job" }]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("rejects NOT_FOUND when source PDF has expired before inserting or consuming quota", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = []
    const bucket = { head: vi.fn(async () => null) }
    const translateQuota = await import("../translate/quota")
    const client = createRouterClient(router, {
      context: ctx(freeSession, { BUCKET_PDFS: bucket as any }),
    })

    await expect(client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })).rejects.toMatchObject({ code: "NOT_FOUND" })

    expect(insertedJobs).toHaveLength(0)
    expect(translateQuota.consumeTranslateQuota).not.toHaveBeenCalled()
    expect(bucket.head).toHaveBeenCalledWith(doneJob.sourceKey)
  })

  it("rolls back the inserted job row when quota consumption fails", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = []
    const translateQuota = await import("../translate/quota")
    ;(translateQuota.consumeTranslateQuota as any).mockRejectedValueOnce(new ORPCError("QUOTA_EXCEEDED"))
    const client = createRouterClient(router, { context: ctx(freeSession) })

    await expect(client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" })

    expect(insertedJobs).toHaveLength(0)
    expect(deletedIds).toHaveLength(1)
  })

  it("rolls back the inserted job row and refunds quota when enqueue fails", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = []
    const translateQuota = await import("../translate/quota")
    ;(translateQuota.consumeTranslateQuota as any).mockImplementationOnce(
      async (_db: unknown, userId: string, bucket: string, amount: number, requestId: string) => {
        usageLogRows.push({
          id: "usage-original",
          userId,
          bucket,
          amount,
          requestId,
          createdAt: new Date(),
        })
      },
    )
    const queue = { send: vi.fn(async () => { throw new Error("queue unavailable") }) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { TRANSLATE_QUEUE: queue as any }),
    })

    await expect(client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })).rejects.toThrow("queue unavailable")

    expect(insertedJobs).toHaveLength(0)
    expect(deletedIds).toHaveLength(1)
    expect(usageLogRows).toContainEqual(expect.objectContaining({
      userId: "u-free",
      bucket: "web_pdf_translate_monthly",
      amount: -doneJob.sourcePages,
      requestId: `refund:${deletedIds[0]}`,
    }))
    expect(updatedQuotaPeriods).toHaveLength(1)
  })
})
