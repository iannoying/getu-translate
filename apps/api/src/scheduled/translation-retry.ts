import { and, eq, gt, inArray, lt } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"

const RETRY_ELIGIBLE_CODES = ["transient_llm", "r2_timeout", "output_write"] as const
const MAX_RETRIES_PER_TICK = 100
const FAILED_WINDOW_MS = 60 * 60_000 // 1h

export type RetryResult = {
  retried: number
  errors: string[]
}

export async function runTranslationRetry(
  db: Db,
  queue: { send: (msg: { jobId: string }) => Promise<unknown> } | undefined,
  opts: { now: number; dryRun?: boolean },
): Promise<RetryResult> {
  const result: RetryResult = { retried: 0, errors: [] }
  if (!queue) return result

  const failedSince = new Date(opts.now - FAILED_WINDOW_MS)

  const candidates = await db
    .select()
    .from(schema.translationJobs)
    .where(
      and(
        eq(schema.translationJobs.status, "failed"),
        inArray(schema.translationJobs.errorCode, [...RETRY_ELIGIBLE_CODES]),
        lt(schema.translationJobs.retriedCount, 3),
        gt(schema.translationJobs.failedAt, failedSince),
      ),
    )
    .limit(MAX_RETRIES_PER_TICK)

  for (const job of candidates) {
    if (opts.dryRun) {
      result.retried++
      continue
    }
    try {
      await db
        .update(schema.translationJobs)
        .set({
          status: "queued",
          retriedCount: job.retriedCount + 1,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        })
        .where(eq(schema.translationJobs.id, job.id))
      await queue.send({ jobId: job.id })
      result.retried++
    } catch (err) {
      result.errors.push(`retry ${job.id}: ${(err as Error).message}`)
    }
  }

  return result
}
