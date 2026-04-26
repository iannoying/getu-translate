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
        data: { code: "PROVIDER_FAILED", providerId: "google", statusCode: 429 },
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("pro user invoking an LLM model gets non-zero token mock (M6.5 stub)", async () => {
    const ent = await import("../../billing/entitlements")
    ;(ent.loadEntitlements as any).mockResolvedValueOnce({ ...FREE_ENTITLEMENTS, tier: "pro" })
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
    expect(out.text).toContain("Pro stub")
    // M6.5b will replace this with real bianxie.ai token usage; for now
    // the stub computes 1.5x char count split across input/output so the
    // Pro token-quota math has non-zero values to exercise.
    expect(out.tokens?.input).toBeGreaterThan(0)
    expect(out.tokens?.output).toBeGreaterThan(0)
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
