import { and, eq, lt } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"

const STUCK_THRESHOLD_MS = 30 * 60_000 // 30min without progress update

export type StuckSweepResult = {
  stuckMarkedFailed: number
}

export async function runTranslationStuckSweep(
  db: Db,
  opts: { now: number; dryRun?: boolean },
): Promise<StuckSweepResult> {
  const cutoff = new Date(opts.now - STUCK_THRESHOLD_MS)

  // Heuristic: status='processing' AND created_at older than threshold.
  // We don't track last-progress-update timestamp explicitly; in practice a
  // job that's been processing > 30min has either D1-stuck (M6.10 risk) or
  // worker-stuck. Mark as failed/transient so retry can pick up.
  const stuck = await db
    .select({ id: schema.translationJobs.id })
    .from(schema.translationJobs)
    .where(
      and(
        eq(schema.translationJobs.status, "processing"),
        lt(schema.translationJobs.createdAt, cutoff),
      ),
    )

  if (!opts.dryRun && stuck.length > 0) {
    await db
      .update(schema.translationJobs)
      .set({
        status: "failed",
        errorCode: "transient_llm",
        errorMessage: "翻译任务超时，已自动重试",
        failedAt: new Date(opts.now),
      })
      .where(
        and(
          eq(schema.translationJobs.status, "processing"),
          lt(schema.translationJobs.createdAt, cutoff),
        ),
      )
  }

  return { stuckMarkedFailed: stuck.length }
}
