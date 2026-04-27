import { describe, expect, it, vi } from "vitest"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { runTranslationCleanup } from "../translation-cleanup"
import { schema } from "@getu/db"
import { eq } from "drizzle-orm"

const NOW_MS = new Date("2026-04-22T03:00:00.000Z").getTime()
// 31 days ago — beyond 30-day window, so expired
const EXPIRED_MS = new Date("2026-03-22T02:00:00.000Z").getTime()
// 29 days from now — within the 30-day retention window, so NOT yet expired
const FRESH_MS = new Date("2026-05-21T03:00:00.000Z").getTime()

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

async function insertTextTranslation(
  db: ReturnType<typeof makeTestDb>["db"],
  opts: { id: string; userId: string; expiresAt: Date | null },
) {
  await db.insert(schema.textTranslations).values({
    id: opts.id,
    userId: opts.userId,
    sourceText: "hello",
    sourceLang: "en",
    targetLang: "zh-Hans",
    results: "{}",
    createdAt: new Date(NOW_MS - 1000),
    expiresAt: opts.expiresAt,
  })
}

async function insertJob(
  db: ReturnType<typeof makeTestDb>["db"],
  opts: { id: string; userId: string; expiresAt: Date; outputHtmlKey?: string; outputMdKey?: string },
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
    status: "done",
    expiresAt: opts.expiresAt,
    outputHtmlKey: opts.outputHtmlKey ?? null,
    outputMdKey: opts.outputMdKey ?? null,
    createdAt: new Date(NOW_MS - 1000),
  })
}

describe("runTranslationCleanup", () => {
  it("deletes expired text_translations and keeps non-expired rows", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u1")
    await insertTextTranslation(db, { id: "tt-expired", userId: "u1", expiresAt: new Date(EXPIRED_MS) })
    await insertTextTranslation(db, { id: "tt-fresh", userId: "u1", expiresAt: new Date(FRESH_MS) })
    await insertTextTranslation(db, { id: "tt-never", userId: "u1", expiresAt: null })

    const result = await runTranslationCleanup(db as any, undefined, { now: NOW_MS })

    expect(result.textTranslationsDeleted).toBe(1)
    const remaining = await db.select({ id: schema.textTranslations.id }).from(schema.textTranslations)
    const ids = remaining.map((r) => r.id)
    expect(ids).not.toContain("tt-expired")
    expect(ids).toContain("tt-fresh")
    expect(ids).toContain("tt-never")
  })

  it("deletes expired translation_jobs DB row and calls R2 bucket.delete with correct keys", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u2")
    await insertJob(db, {
      id: "job-exp",
      userId: "u2",
      expiresAt: new Date(EXPIRED_MS),
      outputHtmlKey: "pdfs/u2/job-exp/output.html",
      outputMdKey: "pdfs/u2/job-exp/output.md",
    })

    const r2Delete = vi.fn<(keys: string[]) => Promise<undefined>>(async () => undefined)
    const bucket = { delete: r2Delete } as unknown as R2Bucket

    const result = await runTranslationCleanup(db as any, bucket, { now: NOW_MS })

    expect(result.translationJobsDeleted).toBe(1)
    expect(r2Delete).toHaveBeenCalledOnce()
    const deletedKeys = r2Delete.mock.calls[0]![0] as unknown as string[]
    expect(deletedKeys).toContain("pdfs/u2/job-exp/source.pdf")
    expect(deletedKeys).toContain("pdfs/u2/job-exp/segments.json")
    expect(deletedKeys).toContain("pdfs/u2/job-exp/output.html")
    expect(deletedKeys).toContain("pdfs/u2/job-exp/output.md")

    // Row deleted from DB
    const jobs = await db.select().from(schema.translationJobs).where(eq(schema.translationJobs.id, "job-exp"))
    expect(jobs).toHaveLength(0)
  })

  it("dryRun=true skips all deletes and returns counts", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u3")
    await insertTextTranslation(db, { id: "tt-dr", userId: "u3", expiresAt: new Date(EXPIRED_MS) })
    await insertJob(db, { id: "job-dr", userId: "u3", expiresAt: new Date(EXPIRED_MS) })

    const r2Delete = vi.fn()
    const bucket = { delete: r2Delete } as unknown as R2Bucket

    const result = await runTranslationCleanup(db as any, bucket, { now: NOW_MS, dryRun: true })

    expect(result.textTranslationsDeleted).toBe(1)
    expect(result.translationJobsDeleted).toBe(1)
    expect(r2Delete).not.toHaveBeenCalled()

    // Nothing deleted from DB
    const texts = await db.select().from(schema.textTranslations)
    expect(texts).toHaveLength(1)
    const jobs = await db.select().from(schema.translationJobs)
    expect(jobs).toHaveLength(1)
  })

  it("no-op when nothing is expired", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u4")
    await insertTextTranslation(db, { id: "tt-ok", userId: "u4", expiresAt: new Date(FRESH_MS) })
    await insertJob(db, { id: "job-ok", userId: "u4", expiresAt: new Date(FRESH_MS) })

    const r2Delete = vi.fn()
    const result = await runTranslationCleanup(db as any, { delete: r2Delete } as unknown as R2Bucket, { now: NOW_MS })

    expect(result.textTranslationsDeleted).toBe(0)
    expect(result.translationJobsDeleted).toBe(0)
    expect(r2Delete).not.toHaveBeenCalled()
  })

  it("handles R2 delete error gracefully and records in errors array", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u5")
    await insertJob(db, { id: "job-err", userId: "u5", expiresAt: new Date(EXPIRED_MS) })

    const bucket = {
      delete: vi.fn(async () => { throw new Error("R2 failure") }),
    } as unknown as R2Bucket

    const result = await runTranslationCleanup(db as any, bucket, { now: NOW_MS })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/R2 failure/)
    // r2ObjectsDeleted stays 0 on error
    expect(result.r2ObjectsDeleted).toBe(0)
    // But DB row is still deleted (cleanup continues after R2 error)
    const jobs = await db.select().from(schema.translationJobs)
    expect(jobs).toHaveLength(0)
  })

  it("omits optional R2 keys when outputHtmlKey/outputMdKey are null", async () => {
    const { db } = makeTestDb()
    await insertUser(db, "u6")
    await insertJob(db, {
      id: "job-noout",
      userId: "u6",
      expiresAt: new Date(EXPIRED_MS),
      // no outputHtmlKey / outputMdKey
    })

    const r2Delete = vi.fn<(keys: string[]) => Promise<undefined>>(async () => undefined)
    const bucket = { delete: r2Delete } as unknown as R2Bucket

    await runTranslationCleanup(db as any, bucket, { now: NOW_MS })

    const deletedKeys = r2Delete.mock.calls[0]![0] as unknown as string[]
    // Only source.pdf + segments.json (2 keys)
    expect(deletedKeys).toHaveLength(2)
    expect(deletedKeys).toContain("pdfs/u6/job-noout/source.pdf")
    expect(deletedKeys).toContain("pdfs/u6/job-noout/segments.json")
  })
})
