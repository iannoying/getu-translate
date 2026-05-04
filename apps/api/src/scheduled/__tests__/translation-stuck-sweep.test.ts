import { describe, expect, it } from "vitest"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { runTranslationStuckSweep } from "../translation-stuck-sweep"
import { schema } from "@getu/db"
import { eq } from "drizzle-orm"

const NOW_MS = new Date("2026-04-22T03:00:00.000Z").getTime()
// 35 min ago — older than the 30min stuck threshold
const STUCK_MS = new Date("2026-04-22T02:25:00.000Z").getTime()
// 10 min ago — within the 30min window (not yet stuck)
const RECENT_MS = new Date("2026-04-22T02:50:00.000Z").getTime()

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

async function insertJob(
  db: ReturnType<typeof makeTestDb>["db"],
  opts: {
    id: string
    userId: string
    status: string
    createdAt: Date
    progressUpdatedAt?: Date | null
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
    status: opts.status as "queued" | "processing" | "done" | "failed",
    expiresAt: new Date(NOW_MS + 30 * 86400_000),
    createdAt: opts.createdAt,
    progressUpdatedAt: opts.progressUpdatedAt,
  })
}

describe("runTranslationStuckSweep", () => {
  it("marks processing jobs older than 30min as failed with transient_llm", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u1")
    await insertJob(db, { id: "j-stuck", userId: "u1", status: "processing", createdAt: new Date(STUCK_MS) })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

    expect(result.stuckMarkedFailed).toBe(1)

    const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-stuck")).get()
    expect(job?.status).toBe("failed")
    expect(job?.errorCode).toBe("transient_llm")
    expect(job?.errorMessage).toBe("翻译任务超时，已自动重试")
    expect(job?.failedAt).not.toBeNull()
  })

  it("does NOT touch processing jobs within the 30min threshold", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u2")
    await insertJob(db, { id: "j-recent", userId: "u2", status: "processing", createdAt: new Date(RECENT_MS) })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

    expect(result.stuckMarkedFailed).toBe(0)

    const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-recent")).get()
    expect(job?.status).toBe("processing")
  })

  it("does NOT mark an old processing job as stuck when progress was updated recently", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u-progress-recent")
    await insertJob(db, {
      id: "j-progress-recent",
      userId: "u-progress-recent",
      status: "processing",
      createdAt: new Date(STUCK_MS),
      progressUpdatedAt: new Date(RECENT_MS),
    })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

    expect(result.stuckMarkedFailed).toBe(0)
    const job = await db
      .select()
      .from(schema.translationJobs)
      .where(eq(schema.translationJobs.id, "j-progress-recent"))
      .get()
    expect(job?.status).toBe("processing")
  })

  it("marks a processing job as stuck when progressUpdatedAt is older than threshold", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u-progress-stale")
    await insertJob(db, {
      id: "j-progress-stale",
      userId: "u-progress-stale",
      status: "processing",
      createdAt: new Date(RECENT_MS),
      progressUpdatedAt: new Date(STUCK_MS),
    })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

    expect(result.stuckMarkedFailed).toBe(1)
    const job = await db
      .select()
      .from(schema.translationJobs)
      .where(eq(schema.translationJobs.id, "j-progress-stale"))
      .get()
    expect(job?.status).toBe("failed")
    expect(job?.failedAt).not.toBeNull()
  })

  it("falls back to createdAt for legacy processing rows with NULL progressUpdatedAt", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u-legacy")
    await insertJob(db, {
      id: "j-legacy",
      userId: "u-legacy",
      status: "processing",
      createdAt: new Date(STUCK_MS),
      progressUpdatedAt: null,
    })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

    expect(result.stuckMarkedFailed).toBe(1)
    const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-legacy")).get()
    expect(job?.status).toBe("failed")
  })

  it("does NOT affect done or queued jobs regardless of age", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u3")
    await insertJob(db, { id: "j-done", userId: "u3", status: "done", createdAt: new Date(STUCK_MS) })
    await insertJob(db, { id: "j-queued", userId: "u3", status: "queued", createdAt: new Date(STUCK_MS) })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

    expect(result.stuckMarkedFailed).toBe(0)

    const done = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-done")).get()
    expect(done?.status).toBe("done")
    const queued = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-queued")).get()
    expect(queued?.status).toBe("queued")
  })

  it("dryRun=true counts stuck jobs without updating DB", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u4")
    await insertJob(db, { id: "j-dr", userId: "u4", status: "processing", createdAt: new Date(STUCK_MS) })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS, dryRun: true })

    expect(result.stuckMarkedFailed).toBe(1)

    // DB unchanged
    const job = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "j-dr")).get()
    expect(job?.status).toBe("processing")
  })

  it("handles multiple stuck jobs and returns correct count", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u5")
    await insertJob(db, { id: "j-s1", userId: "u5", status: "processing", createdAt: new Date(STUCK_MS) })
    // Second job: insert separately since unique index only allows one active-per-user
    // Workaround: use a different user
    await insertUser(db, "u5b")
    await insertJob(db, { id: "j-s2", userId: "u5b", status: "processing", createdAt: new Date(STUCK_MS) })

    const result = await runTranslationStuckSweep(db as any, { now: NOW_MS })

    expect(result.stuckMarkedFailed).toBe(2)
  })
})
