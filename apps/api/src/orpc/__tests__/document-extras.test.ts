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
vi.mock("../../billing/quota", () => ({
  consumeQuota: vi.fn(async () => ({
    bucket: "web_pdf_translate_monthly",
    remaining: 99,
    reset_at: "2026-05-01T00:00:00.000Z",
  })),
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

const fakeDb = {
  insert: vi.fn(() => ({
    values: vi.fn(async (row: Record<string, unknown>) => {
      insertedJobs.push(row)
    }),
  })),
  select: vi.fn((..._cols: unknown[]) => ({
    from: vi.fn(() => ({
      where: vi.fn((..._args: unknown[]) => ({
        get: async () => pendingJobRow ?? undefined,
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
      run: async () => undefined,
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
    const quota = await import("../../billing/quota")
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.retry({ jobId: "job-failed" })
    expect(quota.consumeQuota).toHaveBeenCalledTimes(1)
    const [, calledUserId, calledBucket, calledPages, calledRequestId] = (quota.consumeQuota as any).mock.calls[0]
    expect(calledUserId).toBe("u-free")
    expect(calledBucket).toBe("web_pdf_translate_monthly")
    expect(calledPages).toBe(failedJob.sourcePages)
    expect(calledRequestId).toBe(`web-pdf:u-free:${out.jobId}`)
  })
})
