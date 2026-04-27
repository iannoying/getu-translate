import { describe, expect, it, vi } from "vitest"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { runTranslationRetry } from "../translation-retry"
import { schema } from "@getu/db"
import { eq } from "drizzle-orm"

const NOW_MS = new Date("2026-04-22T03:00:00.000Z").getTime()
// 30 min ago — within the 1h retry window
const RECENT_FAIL_MS = new Date("2026-04-22T02:30:00.000Z").getTime()
// 2h ago — outside the 1h retry window
const OLD_FAIL_MS = new Date("2026-04-22T01:00:00.000Z").getTime()

async function insertUser(db: ReturnType<typeof makeTestDb>["db"], id: string) {
  await db.insert(schema.user).values({
    id,
    email: `${id}@test.invalid`,
    name: id,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function insertFailedJob(
  db: ReturnType<typeof makeTestDb>["db"],
  opts: {
    id: string
    userId: string
    errorCode: string
    retriedCount?: number
    failedAt: Date
  },
) {
  await db.insert(schema.translationJobs).values({
    id: opts.id,
    userId: opts.userId,
    sourceKey: `pdfs/${opts.userId}/${opts.id}/source.pdf`,
    sourcePages: 1,
    modelId: "google",
    sourceLang: "en",
    targetLang: "zh-Hans",
    engine: "simple",
    status: "failed",
    errorCode: opts.errorCode,
    failedAt: opts.failedAt,
    retriedCount: opts.retriedCount ?? 0,
    expiresAt: new Date(NOW_MS + 30 * 86400_000),
    createdAt: new Date(NOW_MS - 60_000),
  })
}

describe("runTranslationRetry", () => {
  it("returns early with no retries when queue is undefined", async () => {
    const { db } = makeTestDb()
    const result = await runTranslationRetry(db as any, undefined, { now: NOW_MS })
    expect(result.retried).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("re-queues eligible failed jobs, increments retriedCount, clears error fields", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u1")
    await insertFailedJob(db, {
      id: "j1",
      userId: "u1",
      errorCode: "transient_llm",
      retriedCount: 0,
      failedAt: new Date(RECENT_FAIL_MS),
    })

    const send = vi.fn(async () => undefined)
    const queue = { send }

    const result = await runTranslationRetry(db as any, queue as any, { now: NOW_MS })

    expect(result.retried).toBe(1)
    expect(send).toHaveBeenCalledWith({ jobId: "j1" })

    const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j1")).get()
    expect(job?.status).toBe("queued")
    expect(job?.retriedCount).toBe(1)
    expect(job?.failedAt).toBeNull()
    expect(job?.errorCode).toBeNull()
    expect(job?.errorMessage).toBeNull()
  })

  it("retries r2_timeout and output_write error codes", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u2a")
    await insertUser(db, "u2b")
    await insertFailedJob(db, { id: "j-r2", userId: "u2a", errorCode: "r2_timeout", failedAt: new Date(RECENT_FAIL_MS) })
    await insertFailedJob(db, { id: "j-out", userId: "u2b", errorCode: "output_write", failedAt: new Date(RECENT_FAIL_MS) })

    const send = vi.fn(async () => undefined)
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS })

    expect(result.retried).toBe(2)
  })

  it("does NOT retry scanned_pdf or generic error codes", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u3")
    await insertFailedJob(db, { id: "j-scan", userId: "u3", errorCode: "scanned_pdf", failedAt: new Date(RECENT_FAIL_MS) })
    await insertFailedJob(db, { id: "j-gen", userId: "u3", errorCode: "generic", failedAt: new Date(RECENT_FAIL_MS) })

    const send = vi.fn(async () => undefined)
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS })

    expect(result.retried).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it("does NOT retry when retriedCount >= 3", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u4")
    await insertFailedJob(db, {
      id: "j-max",
      userId: "u4",
      errorCode: "transient_llm",
      retriedCount: 3,
      failedAt: new Date(RECENT_FAIL_MS),
    })

    const send = vi.fn(async () => undefined)
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS })

    expect(result.retried).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it("does NOT retry failures outside the 1h window", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u5")
    await insertFailedJob(db, {
      id: "j-old",
      userId: "u5",
      errorCode: "transient_llm",
      failedAt: new Date(OLD_FAIL_MS),
    })

    const send = vi.fn(async () => undefined)
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS })

    expect(result.retried).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it("dryRun=true counts candidates without writing DB or sending to queue", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u6")
    await insertFailedJob(db, { id: "j-dr", userId: "u6", errorCode: "transient_llm", failedAt: new Date(RECENT_FAIL_MS) })

    const send = vi.fn(async () => undefined)
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS, dryRun: true })

    expect(result.retried).toBe(1)
    expect(send).not.toHaveBeenCalled()

    // DB unchanged
    const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-dr")).get()
    expect(job?.status).toBe("failed")
    expect(job?.retriedCount).toBe(0)
  })

  it("respects MAX_RETRIES_PER_TICK cap of 100", async () => {
    const { db } = makeTestDb()

    // Insert 105 eligible jobs — each with its own user to avoid the one-active-per-user constraint
    for (let i = 0; i < 105; i++) {
      await insertUser(db, `u7-${i}`)
      await insertFailedJob(db, {
        id: `j-bulk-${i}`,
        userId: `u7-${i}`,
        errorCode: "transient_llm",
        failedAt: new Date(RECENT_FAIL_MS),
      })
    }

    const send = vi.fn(async () => undefined)
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS })

    expect(result.retried).toBe(100)
    expect(send).toHaveBeenCalledTimes(100)
  })

  it("records error in errors array when DB update or queue.send throws", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u8")
    await insertFailedJob(db, { id: "j-err", userId: "u8", errorCode: "transient_llm", failedAt: new Date(RECENT_FAIL_MS) })

    const send = vi.fn(async () => { throw new Error("queue unavailable") })
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS })

    expect(result.retried).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/queue unavailable/)
  })

  it("reverts D1 row to failed when queue.send throws, keeping original retriedCount and errorCode", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u9")
    await insertFailedJob(db, {
      id: "j-revert",
      userId: "u9",
      errorCode: "transient_llm",
      retriedCount: 1,
      failedAt: new Date(RECENT_FAIL_MS),
    })

    const send = vi.fn(async () => { throw new Error("queue send failed") })
    const result = await runTranslationRetry(db as any, { send } as any, { now: NOW_MS })

    expect(result.retried).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/queue send failed/)

    // D1 row must be reverted: still failed, original retriedCount, original errorCode
    const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-revert")).get()
    expect(job?.status).toBe("failed")
    expect(job?.retriedCount).toBe(1)
    expect(job?.errorCode).toBe("transient_llm")
    expect(job?.failedAt).not.toBeNull()
  })
})
