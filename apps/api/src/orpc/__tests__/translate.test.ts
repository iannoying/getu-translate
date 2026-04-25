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
    bucket: "web_text_translate_monthly",
    remaining: 99,
    reset_at: "2026-05-01T00:00:00.000Z",
  })),
}))

// Minimal Drizzle-like fluent stub returning configurable rows.
let pendingActiveJobs: { id: string }[] = []
let insertedJobs: Record<string, unknown>[] = []
let insertedHistory: Record<string, unknown>[] = []
let pendingJobRow: Record<string, unknown> | null = null
let pendingListRows: Record<string, unknown>[] = []

const fakeDb = {
  insert: vi.fn(() => ({
    values: vi.fn(async (row: Record<string, unknown>) => {
      if ("status" in row) insertedJobs.push(row)
      else insertedHistory.push(row)
    }),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn((..._args: unknown[]) => ({
        limit: vi.fn(() => ({ all: async () => pendingActiveJobs })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({ all: async () => pendingListRows })),
        })),
        get: async () => pendingJobRow ?? undefined,
      })),
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

const proSession = { user: { id: "u-pro", email: "p@x" }, session: { id: "s1" } } as any
const freeSession = { user: { id: "u-free", email: "f@x" }, session: { id: "s2" } } as any

beforeEach(async () => {
  vi.clearAllMocks()
  pendingActiveJobs = []
  insertedJobs = []
  insertedHistory = []
  pendingJobRow = null
  pendingListRows = []
  const ent = await import("../../billing/entitlements")
  ;(ent.loadEntitlements as any).mockResolvedValue(FREE_ENTITLEMENTS)
  const quota = await import("../../billing/quota")
  ;(quota.consumeQuota as any).mockResolvedValue({
    bucket: "web_text_translate_monthly",
    remaining: 99,
    reset_at: "2026-05-01T00:00:00.000Z",
  })
})

describe("translate.text — auth & gating", () => {
  it("rejects unauthenticated callers with UNAUTHORIZED", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(
      client.translate.translate({
        text: "hello",
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "google",
        columnId: "c1",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("rejects unknown model id with BAD_REQUEST", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.translate({
        text: "hello",
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "nonexistent-model",
        columnId: "c1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects free user invoking a Pro LLM with FORBIDDEN / PRO_REQUIRED", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.translate({
        text: "hello",
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "claude-sonnet-4-6",
        columnId: "c1",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { code: "PRO_REQUIRED", modelId: "claude-sonnet-4-6" },
    })
  })

  it("rejects free user input over 2000 chars with CHAR_LIMIT_EXCEEDED", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.translate({
        text: "x".repeat(2001),
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "google",
        columnId: "c1",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { code: "CHAR_LIMIT_EXCEEDED", limit: 2000 },
    })
  })

  it("propagates QUOTA_EXCEEDED from consumeQuota", async () => {
    const quota = await import("../../billing/quota")
    ;(quota.consumeQuota as any).mockRejectedValueOnce(
      new ORPCError("INSUFFICIENT_QUOTA", { message: "out of quota" }),
    )
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.translate({
        text: "hello",
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "google",
        columnId: "c1",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_QUOTA" })
  })

  it("free user with quota: google call decrements 1 and returns stub text", async () => {
    const quota = await import("../../billing/quota")
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.translate({
      text: "hello world",
      sourceLang: "en",
      targetLang: "zh-CN",
      modelId: "google",
      columnId: "col-google",
    })
    expect(out.modelId).toBe("google")
    expect(out.tokens).toBeNull() // translate-api kind has no token cost
    expect(out.text).toContain("hello world")
    expect(quota.consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u-free",
      "web_text_translate_monthly",
      1,
      "web-text:u-free:col-google",
      undefined,
    )
  })

  it("pro user can invoke an LLM model and gets token shape", async () => {
    const ent = await import("../../billing/entitlements")
    ;(ent.loadEntitlements as any).mockResolvedValueOnce({ ...FREE_ENTITLEMENTS, tier: "pro" })
    const client = createRouterClient(router, { context: ctx(proSession) })
    const out = await client.translate.translate({
      text: "hello",
      sourceLang: "en",
      targetLang: "zh-CN",
      modelId: "claude-sonnet-4-6",
      columnId: "col-claude",
    })
    expect(out.modelId).toBe("claude-sonnet-4-6")
    expect(out.tokens).toEqual({ input: 0, output: 0 })
  })
})

describe("translate.document.create", () => {
  it("free user with 11-page PDF and 10 remaining → INSUFFICIENT_QUOTA", async () => {
    const quota = await import("../../billing/quota")
    ;(quota.consumeQuota as any).mockRejectedValueOnce(
      new ORPCError("INSUFFICIENT_QUOTA", {
        message: "10 remaining, 11 requested",
      }),
    )
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.create({
        sourceKey: "pdfs/x/source.pdf",
        sourcePages: 11,
        sourceBytes: 100_000,
        modelId: "google",
        sourceLang: "en",
        targetLang: "zh-CN",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_QUOTA" })
  })

  it("rejects free user choosing an LLM model for PDF with PRO_REQUIRED", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.create({
        sourceKey: "pdfs/x/source.pdf",
        sourcePages: 5,
        sourceBytes: 100_000,
        modelId: "claude-sonnet-4-6",
        sourceLang: "en",
        targetLang: "zh-CN",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { code: "PRO_REQUIRED" },
    })
  })

  it("rejects when the user already has a queued job (concurrency cap)", async () => {
    pendingActiveJobs = [{ id: "existing-job" }]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.create({
        sourceKey: "pdfs/x/source.pdf",
        sourcePages: 5,
        sourceBytes: 100_000,
        modelId: "google",
        sourceLang: "en",
        targetLang: "zh-CN",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { code: "PDF_JOB_INFLIGHT", existingJobId: "existing-job" },
    })
  })

  it("happy path: inserts job row with status=queued and returns jobId", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.create({
      sourceKey: "pdfs/x/source.pdf",
      sourcePages: 5,
      sourceBytes: 100_000,
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })
    expect(out.jobId).toBeTruthy()
    expect(insertedJobs).toHaveLength(1)
    expect(insertedJobs[0]).toMatchObject({
      id: out.jobId,
      userId: "u-free",
      status: "queued",
      engine: "simple",
      modelId: "google",
      sourcePages: 5,
    })
  })
})

describe("translate.document.status", () => {
  it("returns NOT_FOUND when job missing", async () => {
    pendingJobRow = null
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.status({ jobId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("returns done job with output keys", async () => {
    pendingJobRow = {
      id: "j1",
      userId: "u-free",
      status: "done",
      progress: null,
      outputHtmlKey: "pdfs/j1/output.html",
      outputMdKey: "pdfs/j1/output.md",
      errorMessage: null,
    }
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.status({ jobId: "j1" })
    expect(out).toMatchObject({
      jobId: "j1",
      status: "done",
      outputHtmlKey: "pdfs/j1/output.html",
      outputMdKey: "pdfs/j1/output.md",
    })
  })

  it("parses JSON progress payload", async () => {
    pendingJobRow = {
      id: "j2",
      userId: "u-free",
      status: "processing",
      progress: JSON.stringify({ stage: "translate", pct: 50 }),
      outputHtmlKey: null,
      outputMdKey: null,
      errorMessage: null,
    }
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.status({ jobId: "j2" })
    expect(out.progress).toEqual({ stage: "translate", pct: 50 })
  })
})
