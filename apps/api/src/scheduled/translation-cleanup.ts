import { lt, isNotNull, and } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"

export type CleanupResult = {
  textTranslationsDeleted: number
  translationJobsDeleted: number
  r2ObjectsDeleted: number
  errors: string[]
}

export async function runTranslationCleanup(
  db: Db,
  bucket: R2Bucket | undefined,
  opts: { now: number; dryRun?: boolean },
): Promise<CleanupResult> {
  const result: CleanupResult = {
    textTranslationsDeleted: 0,
    translationJobsDeleted: 0,
    r2ObjectsDeleted: 0,
    errors: [],
  }

  const cutoff = new Date(opts.now)

  // 1. Delete expired text_translations (only Free user rows have non-null expires_at)
  const textRows = await db
    .select({ id: schema.textTranslations.id })
    .from(schema.textTranslations)
    .where(
      and(
        isNotNull(schema.textTranslations.expiresAt),
        lt(schema.textTranslations.expiresAt, cutoff),
      ),
    )
  if (!opts.dryRun && textRows.length > 0) {
    await db
      .delete(schema.textTranslations)
      .where(
        and(
          isNotNull(schema.textTranslations.expiresAt),
          lt(schema.textTranslations.expiresAt, cutoff),
        ),
      )
  }
  result.textTranslationsDeleted = textRows.length

  // 2. Find expired translation_jobs and gather R2 keys
  const jobs = await db
    .select()
    .from(schema.translationJobs)
    .where(lt(schema.translationJobs.expiresAt, cutoff))

  if (jobs.length > 0) {
    const r2Keys: string[] = []
    for (const job of jobs) {
      r2Keys.push(job.sourceKey)
      const segmentsKey = job.sourceKey.replace(/source\.pdf$/, "segments.json")
      r2Keys.push(segmentsKey)
      if (job.outputHtmlKey) r2Keys.push(job.outputHtmlKey)
      if (job.outputMdKey) r2Keys.push(job.outputMdKey)
    }

    if (!opts.dryRun && bucket) {
      // R2.delete supports an array of keys (batch). Process in chunks of 1000 (R2 limit).
      const CHUNK = 1000
      for (let i = 0; i < r2Keys.length; i += CHUNK) {
        const chunk = r2Keys.slice(i, i + CHUNK)
        try {
          await bucket.delete(chunk)
          result.r2ObjectsDeleted += chunk.length
        } catch (err) {
          result.errors.push(`r2 delete batch ${i}: ${(err as Error).message}`)
        }
      }
    } else if (!opts.dryRun && !bucket) {
      result.errors.push("bucket not bound — R2 objects not deleted")
    }

    if (!opts.dryRun) {
      // Delete D1 rows AFTER R2 cleanup (so a partial cleanup leaves orphaned R2 over orphaned DB)
      await db
        .delete(schema.translationJobs)
        .where(lt(schema.translationJobs.expiresAt, cutoff))
    }
    result.translationJobsDeleted = jobs.length
  }

  return result
}
