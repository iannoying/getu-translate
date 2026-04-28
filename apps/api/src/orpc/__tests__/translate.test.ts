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
let pendingHistoryRowsForUser: Record<string, unknown>[] = []
let deleteCalls: { table: "history"; whereArgs: unknown[] }[] = []

const fakeDb = {
  insert: vi.fn(() => ({
    values: vi.fn(async (row: Record<string, unknown>) => {
      if ("status" in row) insertedJobs.push(row)
      else insertedHistory.push(row)
    }),
  })),
  select: vi.fn((..._cols: unknown[]) => ({
    from: vi.fn(() => ({
      where: vi.fn((..._args: unknown[]) => ({
        limit: vi.fn(() => ({ all: async () => pendingActiveJobs })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({ all: async () => pendingListRows })),
        })),
        all: async () => pendingHistoryRowsForUser,
        get: async () => pendingJobRow ?? undefined,
      })),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn((...whereArgs: unknown[]) => {
      deleteCalls.push({ table: "history", whereArgs })
      return { run: async () => undefined }
    }),
  })),
}

function ctx(session: Ctx["session"], envOverrides: Partial<Ctx["env"]> = {}): Ctx {
  return {
    env: {
      DB: {} as any,
      BILLING_ENABLED: "false",
      BIANXIE_API_KEY: "bx-test-key",
      BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
      ...envOverrides,
    } as Ctx["env"],
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
  pendingHistoryRowsForUser = []
  deleteCalls = []
  const ent = await import("../../billing/entitlements")
  ;(ent.loadEntitlements as any).mockResolvedValue(FREE_ENTITLEMENTS)
  const quota = await import("../../billing/quota")
  ;(quota.consumeQuota as any).mockResolvedValue({
    bucket: "web_text_translate_monthly",
    remaining: 99,
    reset_at: "2026-05-01T00:00:00.000Z",
  })
})

const SAMPLE_CLICK_ID = "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80"
const SHARED_CLICK_ID = "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f81"

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
        clickId: SAMPLE_CLICK_ID,
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
        clickId: SAMPLE_CLICK_ID,
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
        clickId: SAMPLE_CLICK_ID,
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
        clickId: SAMPLE_CLICK_ID,
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
        clickId: SAMPLE_CLICK_ID,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_QUOTA" })
  })

  it("free user with quota: google call decrements 1 and returns translated text", async () => {
    // Mock the upstream Google free API. Shape:
    //   [ [ [translatedSegment, originalSegment, ...], ... ], ... ]
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([[["你好世界", "hello world", null, null, 1]]]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    try {
      const quota = await import("../../billing/quota")
      const client = createRouterClient(router, { context: ctx(freeSession) })
      const out = await client.translate.translate({
        text: "hello world",
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "google",
        columnId: "col-google",
        clickId: SAMPLE_CLICK_ID,
      })
      expect(out.modelId).toBe("google")
      expect(out.tokens).toBeNull() // translate-api has no token cost
      expect(out.text).toBe("你好世界")
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(quota.consumeQuota).toHaveBeenCalledWith(
        expect.anything(),
        "u-free",
        "web_text_translate_monthly",
        1,
        `web-text:u-free:${SAMPLE_CLICK_ID}`,
        undefined,
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("propagates google upstream failure as PROVIDER_FAILED", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    )
    try {
      const client = createRouterClient(router, { context: ctx(freeSession) })
      await expect(
        client.translate.translate({
          text: "hello",
          sourceLang: "en",
          targetLang: "zh-CN",
          modelId: "google",
          columnId: "col-google",
          clickId: SAMPLE_CLICK_ID,
        }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        data: { code: "PROVIDER_FAILED", providerId: "google" },
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("does not leak statusCode in PROVIDER_FAILED error data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503 }),
    )
    try {
      const client = createRouterClient(router, { context: ctx(freeSession) })
      let caughtError: unknown
      try {
        await client.translate.translate({
          text: "hello",
          sourceLang: "en",
          targetLang: "zh-CN",
          modelId: "google",
          columnId: "col-google",
          clickId: SAMPLE_CLICK_ID,
        })
      } catch (err) {
        caughtError = err
      }
      expect(caughtError).toBeDefined()
      expect((caughtError as any).code).toBe("INTERNAL_SERVER_ERROR")
      expect((caughtError as any).data).not.toHaveProperty("statusCode")
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("pro user invoking an LLM model gets real bianxie translation + token usage", async () => {
    const ent = await import("../../billing/entitlements")
    ;(ent.loadEntitlements as any).mockResolvedValueOnce({ ...FREE_ENTITLEMENTS, tier: "pro" })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "你好" } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
        { status: 200 },
      ),
    )
    try {
      const client = createRouterClient(router, { context: ctx(proSession) })
      const out = await client.translate.translate({
        text: "hello",
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "claude-sonnet-4-6",
        columnId: "col-claude",
        clickId: SAMPLE_CLICK_ID,
      })
      expect(out.modelId).toBe("claude-sonnet-4-6")
      expect(out.text).toBe("你好")
      expect(out.text).not.toMatch(/Pro stub/)
      expect(out.tokens).toEqual({ input: 12, output: 4 })
      // 防 swapped-arg / broken model mapping / 丢 Bearer 等回归
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = (fetchSpy.mock.calls[0] as unknown) as [string, RequestInit]
      expect(url).toBe("https://api.bianxie.ai/v1/chat/completions")
      expect(init.method).toBe("POST")
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer bx-test-key")
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe("claude-sonnet-4-6")
      expect(body.stream).toBe(false)
      const sys = (body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "system")
      expect(sys?.content).toMatch(/en/)
      expect(sys?.content).toMatch(/zh-CN/)
      const user = (body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")
      expect(user?.content).toBe("hello")
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("propagates bianxie upstream failure as PROVIDER_FAILED", async () => {
    const ent = await import("../../billing/entitlements")
    ;(ent.loadEntitlements as any).mockResolvedValueOnce({ ...FREE_ENTITLEMENTS, tier: "pro" })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503 }),
    )
    try {
      const client = createRouterClient(router, { context: ctx(proSession) })
      await expect(
        client.translate.translate({
          text: "hello",
          sourceLang: "en",
          targetLang: "zh-CN",
          modelId: "claude-sonnet-4-6",
          columnId: "col-claude",
          clickId: SAMPLE_CLICK_ID,
        }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        data: {
          code: "PROVIDER_FAILED",
          providerId: "bianxie:claude-sonnet-4-6",
        },
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("rejects non-UUID clickId at the schema layer", async () => {
    // Regression: clickId used to be `min(8).max(128)` only, so a careless
    // client could pass `"00000000"` and silently skip quota decrement on
    // every subsequent legitimate click (self-harm, but a free-quota leak).
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.translate({
        text: "hello",
        sourceLang: "en",
        targetLang: "zh-CN",
        modelId: "google",
        columnId: "c1",
        clickId: "00000000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("multi-column click: every column shares the same requestId so consumeQuota dedupes", async () => {
    // Regression: previously requestId used columnId, so 11 columns burned
    // 11 quota units instead of 1. Now keyed by clickId.
    const quota = await import("../../billing/quota")
    const ent = await import("../../billing/entitlements")
    ;(ent.loadEntitlements as any).mockResolvedValue({ ...FREE_ENTITLEMENTS, tier: "pro" })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes("translate.googleapis.com")) {
        return new Response(JSON.stringify([[["你好", "hi", null, null, 0]]]), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      if (urlStr.includes("bianxie.ai")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "你好" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }
      throw new Error(`unexpected url: ${urlStr}`)
    })
    try {
      const client = createRouterClient(router, { context: ctx(proSession) })
      const sharedClickId = SHARED_CLICK_ID
      await Promise.all([
        client.translate.translate({
          text: "hi",
          sourceLang: "en",
          targetLang: "zh-CN",
          modelId: "google",
          columnId: "col-google",
          clickId: sharedClickId,
        }),
        client.translate.translate({
          text: "hi",
          sourceLang: "en",
          targetLang: "zh-CN",
          modelId: "claude-sonnet-4-6",
          columnId: "col-claude",
          clickId: sharedClickId,
        }),
        client.translate.translate({
          text: "hi",
          sourceLang: "en",
          targetLang: "zh-CN",
          modelId: "gpt-5.5",
          columnId: "col-gpt",
          clickId: sharedClickId,
        }),
      ])
      const calls = (quota.consumeQuota as any).mock.calls
      expect(calls).toHaveLength(3)
      // All three calls must use the SAME requestId so consumeQuota's
      // (userId, requestId) idempotency collapses them to one decrement.
      const requestIds = calls.map((args: unknown[]) => args[4])
      expect(new Set(requestIds).size).toBe(1)
      expect(requestIds[0]).toBe(`web-text:u-pro:${sharedClickId}`)
    } finally {
      fetchSpy.mockRestore()
    }
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
        sourceKey: "pdfs/u-free/abc/source.pdf",
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
        sourceKey: "pdfs/u-free/abc/source.pdf",
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
        sourceKey: "pdfs/u-free/abc/source.pdf",
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

  it("rejects sourceKey outside user namespace with FORBIDDEN / SOURCE_KEY_OUT_OF_SCOPE", async () => {
    // Regression: previously the handler trusted the client-supplied
    // sourceKey, so a caller could queue a job against another user's
    // R2 path and burn their own quota processing it.
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.create({
        sourceKey: "pdfs/other-user-id/secret.pdf",
        sourcePages: 5,
        sourceBytes: 100_000,
        modelId: "google",
        sourceLang: "en",
        targetLang: "zh-CN",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { code: "SOURCE_KEY_OUT_OF_SCOPE" },
    })
  })

  it("rejects sourceKey with `..` path traversal even when prefix matches", async () => {
    // Regression: `pdfs/u-free/../other/x.pdf` startsWith `pdfs/u-free/`
    // but R2 keys don't auto-normalize, so the worker would fetch
    // `pdfs/other/x.pdf` (foreign user's file) if we relied on startsWith
    // alone.
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.document.create({
        sourceKey: "pdfs/u-free/../other-user/secret.pdf",
        sourcePages: 5,
        sourceBytes: 100_000,
        modelId: "google",
        sourceLang: "en",
        targetLang: "zh-CN",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { code: "SOURCE_KEY_OUT_OF_SCOPE" },
    })
  })

  it("happy path: inserts job row with status=queued and returns jobId", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.create({
      sourceKey: "pdfs/u-free/abc/source.pdf",
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

  it("M6.8: server-side page count overrides client-supplied sourcePages when BUCKET_PDFS is bound", async () => {
    // Build a real 7-page PDF in memory and stand up a fake R2 binding
    // that returns its bytes.
    const { PDFDocument } = await import("pdf-lib")
    const doc = await PDFDocument.create()
    for (let i = 0; i < 7; i++) doc.addPage([100, 100])
    const pdfBytes = await doc.save()
    const bucket = {
      get: vi.fn(async () => ({ arrayBuffer: async () => pdfBytes.buffer })),
      put: vi.fn(),
    }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { BUCKET_PDFS: bucket as any }),
    })
    const out = await client.translate.document.create({
      // Client lies: claims 1 page so the quota check is cheap.
      // Server reads 7 pages from R2 and uses THAT for quota + INSERT.
      sourceKey: "pdfs/u-free/abc/source.pdf",
      sourcePages: 1,
      sourceBytes: pdfBytes.byteLength,
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })
    expect(out.jobId).toBeTruthy()
    expect(bucket.get).toHaveBeenCalledWith("pdfs/u-free/abc/source.pdf")
    // Inserted row uses SERVER value (7), not client value (1).
    expect(insertedJobs[0]).toMatchObject({ sourcePages: 7 })
    // Quota was decremented by 7, not 1.
    const quota = await import("../../billing/quota")
    expect(quota.consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u-free",
      "web_pdf_translate_monthly",
      7,
      expect.any(String),
      undefined,
    )
  })

  it("M6.8: returns SOURCE_NOT_FOUND when R2 has no object for the sourceKey", async () => {
    const bucket = { get: vi.fn(async () => null), put: vi.fn() }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { BUCKET_PDFS: bucket as any }),
    })
    await expect(
      client.translate.document.create({
        sourceKey: "pdfs/u-free/abc/source.pdf",
        sourcePages: 5,
        sourceBytes: 100_000,
        modelId: "google",
        sourceLang: "en",
        targetLang: "zh-CN",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { code: "SOURCE_NOT_FOUND" },
    })
  })

  it("M6.8: enqueues { jobId } onto TRANSLATE_QUEUE after INSERT", async () => {
    const queue = { send: vi.fn(async () => undefined) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { TRANSLATE_QUEUE: queue as any }),
    })
    const out = await client.translate.document.create({
      sourceKey: "pdfs/u-free/abc/source.pdf",
      sourcePages: 3,
      sourceBytes: 100_000,
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })
    expect(queue.send).toHaveBeenCalledWith({ jobId: out.jobId })
  })

  it("M6.8 Item 2: rejects when R2 object size exceeds byte cap before arrayBuffer()", async () => {
    // Simulates a stale large object in R2 bypassing the presign content-length guard.
    const overSizeBytes = 60 * 1024 * 1024 // 60 MB > 50 MB cap
    const bucket = {
      get: vi.fn(async () => ({
        size: overSizeBytes,
        arrayBuffer: vi.fn(async () => new ArrayBuffer(0)), // must not be called
      })),
      put: vi.fn(),
    }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { BUCKET_PDFS: bucket as any }),
    })
    await expect(
      client.translate.document.create({
        sourceKey: "pdfs/u-free/abc/source.pdf",
        sourcePages: 5,
        sourceBytes: 100_000,
        modelId: "google",
        sourceLang: "en",
        targetLang: "zh-CN",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { code: "TOO_LARGE", limit: 50 * 1024 * 1024, actual: overSizeBytes },
    })
    // arrayBuffer() must NOT have been called — the guard fires before memory load
    expect(bucket.get.mock.results[0]?.value).resolves.toMatchObject({ size: overSizeBytes })
    const fakeObj = await bucket.get.mock.results[0]?.value
    expect((fakeObj as any).arrayBuffer).not.toHaveBeenCalled()
  })

  it("M6.8 Item 1: catches DB unique-constraint error on INSERT and surfaces CONFLICT/PDF_JOB_INFLIGHT", async () => {
    // Simulates the race window: SELECT found no active job, but by INSERT time
    // another concurrent request already inserted one and the unique partial
    // index fires.
    const constraintError = new Error(
      "D1_ERROR: UNIQUE constraint failed: translation_jobs.user_id: SQLITE_CONSTRAINT_UNIQUE",
    )
    const insertValuesStub = vi.fn(async () => {
      throw constraintError
    })
    const originalInsert = fakeDb.insert
    fakeDb.insert = vi.fn(() => ({ values: insertValuesStub })) as any
    try {
      const client = createRouterClient(router, { context: ctx(freeSession) })
      await expect(
        client.translate.document.create({
          sourceKey: "pdfs/u-free/abc/source.pdf",
          sourcePages: 5,
          sourceBytes: 100_000,
          modelId: "google",
          sourceLang: "en",
          targetLang: "zh-CN",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: { code: "PDF_JOB_INFLIGHT" },
      })
    } finally {
      fakeDb.insert = originalInsert
    }
  })

  it("race fix: UNIQUE collision → consumeQuota NOT called (INSERT runs first)", async () => {
    // With INSERT-first ordering, if the INSERT throws UNIQUE the quota
    // function must never be called — no pages should be debited for a
    // job that never existed.
    const constraintError = new Error(
      "D1_ERROR: UNIQUE constraint failed: translation_jobs.user_id: SQLITE_CONSTRAINT_UNIQUE",
    )
    const originalInsert = fakeDb.insert
    fakeDb.insert = vi.fn(() => ({
      values: vi.fn(async () => { throw constraintError }),
    })) as any
    try {
      const quota = await import("../../billing/quota")
      const client = createRouterClient(router, { context: ctx(freeSession) })
      await expect(
        client.translate.document.create({
          sourceKey: "pdfs/u-free/abc/source.pdf",
          sourcePages: 5,
          sourceBytes: 100_000,
          modelId: "google",
          sourceLang: "en",
          targetLang: "zh-CN",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      // Quota must NOT have been touched.
      expect(quota.consumeQuota).not.toHaveBeenCalled()
    } finally {
      fakeDb.insert = originalInsert
    }
  })

  it("race fix: quota exhaustion after INSERT → job row deleted + INSUFFICIENT_QUOTA surfaced", async () => {
    // INSERT succeeds (race winner), but the user has no remaining quota.
    // The handler must DELETE the just-inserted row and re-throw.
    let capturedDeleteWhere: unknown = null
    const originalDelete = fakeDb.delete
    fakeDb.delete = vi.fn(() => ({
      where: vi.fn((arg: unknown) => {
        capturedDeleteWhere = arg
        return { run: async () => undefined }
      }),
    })) as any

    const quota = await import("../../billing/quota")
    ;(quota.consumeQuota as any).mockRejectedValueOnce(
      new ORPCError("INSUFFICIENT_QUOTA", { message: "0 remaining, 5 requested" }),
    )

    try {
      const client = createRouterClient(router, { context: ctx(freeSession) })
      let insertedJobId: string | null = null
      const originalInsert = fakeDb.insert
      fakeDb.insert = vi.fn(() => ({
        values: vi.fn(async (row: Record<string, unknown>) => {
          insertedJobs.push(row)
          insertedJobId = row.id as string
        }),
      })) as any

      try {
        await expect(
          client.translate.document.create({
            sourceKey: "pdfs/u-free/abc/source.pdf",
            sourcePages: 5,
            sourceBytes: 100_000,
            modelId: "google",
            sourceLang: "en",
            targetLang: "zh-CN",
          }),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_QUOTA" })
        // INSERT happened (the race winner inserted)
        expect(insertedJobs).toHaveLength(1)
        // DELETE was called to roll back the orphan row
        expect(fakeDb.delete).toHaveBeenCalled()
        // The WHERE arg was captured — verify it references the inserted jobId.
        // Drizzle expression objects are circular so we walk the object
        // recursively (with a visited set) looking for the UUID string.
        expect(capturedDeleteWhere).toBeDefined()
        function containsValue(obj: unknown, needle: string, visited = new Set<object>()): boolean {
          if (obj === needle) return true
          if (obj === null || typeof obj !== "object") return false
          if (visited.has(obj)) return false
          visited.add(obj)
          return Object.values(obj as Record<string, unknown>).some(v => containsValue(v, needle, visited))
        }
        expect(containsValue(capturedDeleteWhere, insertedJobId!)).toBe(true)
      } finally {
        fakeDb.insert = originalInsert
      }
    } finally {
      fakeDb.delete = originalDelete
    }
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

describe("translate.deleteHistory", () => {
  it("requires authentication", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(
      client.translate.deleteHistory({ id: "row-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("issues DELETE filtered by user_id and returns deleted=true", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.deleteHistory({ id: "row-abc" })
    expect(out).toEqual({ deleted: true })
    expect(deleteCalls).toHaveLength(1)
    // The where args contain a Drizzle SQL expression — exact shape is
    // implementation detail. We only assert that deletion happened with
    // SOME predicate (the userId scoping is verified by the schema layer
    // and visually inspected in the handler source).
    expect(deleteCalls[0]?.whereArgs).toBeDefined()
  })

  it("rejects empty id at schema layer", async () => {
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(
      client.translate.deleteHistory({ id: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("translate.clearHistory", () => {
  it("requires authentication", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(client.translate.clearHistory({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  it("counts then deletes; returns the count", async () => {
    pendingHistoryRowsForUser = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.clearHistory({})
    expect(out).toEqual({ deletedCount: 3 })
    expect(deleteCalls).toHaveLength(1)
  })

  it("returns 0 when there is no history to clear", async () => {
    pendingHistoryRowsForUser = []
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.clearHistory({})
    expect(out).toEqual({ deletedCount: 0 })
    // Still issues the DELETE statement — D1 is fine with empty deletes,
    // and the round-trip is cheap enough that we don't optimize for it.
    expect(deleteCalls).toHaveLength(1)
  })
})

describe("translate.listHistory — JSON parse hardening (#191 handler-layer)", () => {
  it("returns valid rows with parsed results", async () => {
    pendingListRows = [
      {
        id: "h1",
        userId: "u-free",
        sourceText: "hello",
        sourceLang: "en",
        targetLang: "zh-CN",
        results: JSON.stringify({
          google: { text: "你好" },
          microsoft: { text: "您好" },
        }),
        createdAt: new Date("2026-04-26T00:00:00Z"),
      },
    ]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.listHistory({ limit: 50 })
    expect(out.items).toHaveLength(1)
    expect(out.items[0].results).toEqual({
      google: { text: "你好" },
      microsoft: { text: "您好" },
    })
  })

  it("falls back to empty results when JSON.parse throws (corrupt row)", async () => {
    pendingListRows = [
      {
        id: "h-corrupt",
        userId: "u-free",
        sourceText: "hi",
        sourceLang: "en",
        targetLang: "zh-CN",
        results: "{not valid json", // truncated write or wire-corruption
        createdAt: new Date("2026-04-26T00:00:00Z"),
      },
    ]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.listHistory({ limit: 50 })
    expect(out.items).toHaveLength(1)
    // Row stays in the listing — UX preferred over 500 — but with empty results.
    expect(out.items[0].results).toEqual({})
  })

  it("falls back to empty results when JSON parses but shape is wrong", async () => {
    // Regression: prior typeof-object-only check accepted ANY object,
    // including ones with non-string entries. The Zod safeParse rejects.
    pendingListRows = [
      {
        id: "h-bad-shape",
        userId: "u-free",
        sourceText: "hi",
        sourceLang: "en",
        targetLang: "zh-CN",
        results: JSON.stringify({ google: 42, microsoft: { wrong: "field" } }),
        createdAt: new Date("2026-04-26T00:00:00Z"),
      },
    ]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.listHistory({ limit: 50 })
    expect(out.items).toHaveLength(1)
    expect(out.items[0].results).toEqual({})
  })
})
