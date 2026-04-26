/**
 * Integration tests for POST /from-url (Hono route).
 *
 * Pattern: mount `documentRoutes` on a bare Hono app, mock auth +
 * Drizzle + billing so we exercise the route handler end-to-end without
 * hitting real D1/R2/Queue.
 */
import { Hono } from "hono"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { ORPCError } from "@orpc/server"
import { FREE_ENTITLEMENTS } from "@getu/contract"
import { documentRoutes } from "../document"

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@getu/db", async (orig) => {
  const actual = await orig<typeof import("@getu/db")>()
  return { ...actual, createDb: vi.fn(() => fakeDb) }
})

vi.mock("../../billing/entitlements", () => ({
  loadEntitlements: vi.fn(async () => FREE_ENTITLEMENTS),
}))

// consumeTranslateQuota delegates to consumeQuota from billing/quota
vi.mock("../../billing/quota", () => ({
  consumeQuota: vi.fn(async () => ({
    bucket: "web_pdf_translate_monthly",
    remaining: 99,
    reset_at: "2026-05-01T00:00:00.000Z",
  })),
}))

// Mock auth module so getSession is controllable per-test
vi.mock("../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: vi.fn(async () => fakeSession),
    },
  })),
}))

// ---------------------------------------------------------------------------
// Shared fake DB (fluent stub matching translate.test.ts pattern)
// ---------------------------------------------------------------------------

let pendingActiveJobs: { id: string }[] = []
let insertedJobs: Record<string, unknown>[] = []

const fakeDb = {
  insert: vi.fn(() => ({
    values: vi.fn(async (row: Record<string, unknown>) => {
      insertedJobs.push(row)
    }),
  })),
  select: vi.fn((..._cols: unknown[]) => ({
    from: vi.fn(() => ({
      where: vi.fn((..._args: unknown[]) => ({
        limit: vi.fn(() => ({ all: async () => pendingActiveJobs })),
      })),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(() => ({ run: async () => undefined })),
  })),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fakeSession: { user: { id: string; email: string } } | null = {
  user: { id: "u-free", email: "f@x" },
}

function makeEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DB: {} as any,
    BILLING_ENABLED: "false",
    ...overrides,
  }
}

function makeApp() {
  const app = new Hono<{ Bindings: any }>()
  app.route("/", documentRoutes)
  return app
}

async function post(
  app: ReturnType<typeof makeApp>,
  path: string,
  body: unknown,
  env: Record<string, unknown> = makeEnv(),
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, env)
}

const VALID_FROM_URL_BODY = {
  src: "https://arxiv.org/pdf/2401.00000",
  modelId: "google",
  sourceLang: "en",
  targetLang: "zh-CN",
}

// ---------------------------------------------------------------------------
// beforeEach reset
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks()
  pendingActiveJobs = []
  insertedJobs = []
  fakeSession = { user: { id: "u-free", email: "f@x" } }

  const ent = await import("../../billing/entitlements")
  ;(ent.loadEntitlements as any).mockResolvedValue(FREE_ENTITLEMENTS)

  const quota = await import("../../billing/quota")
  ;(quota.consumeQuota as any).mockResolvedValue({
    bucket: "web_pdf_translate_monthly",
    remaining: 99,
    reset_at: "2026-05-01T00:00:00.000Z",
  })

  const auth = await import("../../auth")
  ;(auth.createAuth as any).mockReturnValue({
    api: {
      getSession: vi.fn(async () => fakeSession),
    },
  })

  // Reset DB stub
  fakeDb.insert.mockReturnValue({
    values: vi.fn(async (row: Record<string, unknown>) => {
      insertedJobs.push(row)
    }),
  })
  fakeDb.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({ all: async () => pendingActiveJobs })),
      })),
    })),
  })
  fakeDb.delete.mockReturnValue({
    where: vi.fn(() => ({ run: async () => undefined })),
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /from-url — auth", () => {
  it("returns 401 for anonymous requests", async () => {
    fakeSession = null
    const auth = await import("../../auth")
    ;(auth.createAuth as any).mockReturnValue({
      api: { getSession: vi.fn(async () => null) },
    })
    const app = makeApp()
    const res = await post(app, "/from-url", VALID_FROM_URL_BODY)
    expect(res.status).toBe(401)
    const json = await res.json() as any
    expect(json.error).toBe("unauthorized")
  })
})

describe("POST /from-url — SSRF guard", () => {
  it("returns 400 PRIVATE_HOST for a private IP src", async () => {
    const app = makeApp()
    const res = await post(app, "/from-url", {
      ...VALID_FROM_URL_BODY,
      src: "http://169.254.169.254/latest/meta-data/",
    })
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toBe("PRIVATE_HOST")
  })
})

describe("POST /from-url — concurrency cap", () => {
  it("returns 409 PDF_JOB_INFLIGHT when user already has an active job", async () => {
    pendingActiveJobs = [{ id: "existing-job-id" }]
    // Need a fetch mock that returns a valid PDF so we pass SSRF check, but
    // the concurrency check runs BEFORE the fetch in the route. Provide a
    // fetch mock to be safe.
    const app = makeApp()
    const res = await post(app, "/from-url", VALID_FROM_URL_BODY)
    expect(res.status).toBe(409)
    const json = await res.json() as any
    expect(json.error).toBe("PDF_JOB_INFLIGHT")
  })
})

describe("POST /from-url — happy path", () => {
  it("inserts a job row, sends to queue, returns 200 with jobId", async () => {
    // Build a tiny valid PDF
    const { PDFDocument } = await import("pdf-lib")
    const doc = await PDFDocument.create()
    doc.addPage([100, 100])
    doc.addPage([100, 100])
    const pdfBytes = await doc.save()

    // Mock global fetch so the route's fetchPdfFromUrl returns our PDF
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(pdfBytes, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    )

    const queue = { send: vi.fn(async () => undefined) }
    const bucket = {
      put: vi.fn(async () => undefined),
      get: vi.fn(),
    }

    const app = makeApp()
    const res = await post(app, "/from-url", VALID_FROM_URL_BODY, makeEnv({
      BUCKET_PDFS: bucket,
      TRANSLATE_QUEUE: queue,
    }))

    fetchSpy.mockRestore()

    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.jobId).toBeTruthy()
    expect(json.sourcePages).toBe(2)

    // DB INSERT happened
    expect(insertedJobs).toHaveLength(1)
    expect(insertedJobs[0]).toMatchObject({
      userId: "u-free",
      status: "queued",
      engine: "simple",
      modelId: "google",
      sourcePages: 2,
    })

    // Queue was notified
    expect(queue.send).toHaveBeenCalledWith({ jobId: json.jobId })
  })
})

describe("POST /from-url — UNIQUE race → 409", () => {
  it("returns 409 PDF_JOB_INFLIGHT when INSERT throws UNIQUE constraint (double-fire race)", async () => {
    const { PDFDocument } = await import("pdf-lib")
    const doc = await PDFDocument.create()
    doc.addPage([100, 100])
    const pdfBytes = await doc.save()

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(pdfBytes, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    )

    // Simulate the second concurrent request losing the INSERT race
    fakeDb.insert.mockReturnValueOnce({
      values: vi.fn(async () => {
        throw new Error(
          "D1_ERROR: UNIQUE constraint failed: translation_jobs.user_id: SQLITE_CONSTRAINT_UNIQUE",
        )
      }),
    })

    const app = makeApp()
    const res = await post(app, "/from-url", VALID_FROM_URL_BODY)

    fetchSpy.mockRestore()

    expect(res.status).toBe(409)
    const json = await res.json() as any
    expect(json.error).toBe("PDF_JOB_INFLIGHT")
  })
})

describe("POST /from-url — quota rejection", () => {
  it("returns 402 INSUFFICIENT_QUOTA when consumeTranslateQuota rejects", async () => {
    const { PDFDocument } = await import("pdf-lib")
    const doc = await PDFDocument.create()
    doc.addPage([100, 100])
    const pdfBytes = await doc.save()

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(pdfBytes, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    )

    const quota = await import("../../billing/quota")
    ;(quota.consumeQuota as any).mockRejectedValueOnce(
      new ORPCError("INSUFFICIENT_QUOTA", { message: "quota exceeded", data: { code: "INSUFFICIENT_QUOTA" } }),
    )

    const app = makeApp()
    const res = await post(app, "/from-url", VALID_FROM_URL_BODY)

    fetchSpy.mockRestore()

    expect(res.status).toBe(402)
    const json = await res.json() as any
    expect(json.error).toBe("INSUFFICIENT_QUOTA")
  })
})
