import { and, eq, lt, sql } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"

const STUCK_THRESHOLD_MS = 30 * 60_000 // 30min without progress update

export type StuckSweepResult = {
  stuckMarkedFailed: number
}

function stuckHeartbeatCutoff(cutoff: Date) {
  return lt(
    sql`COALESCE(${schema.translationJobs.progressUpdatedAt}, ${schema.translationJobs.createdAt})`,
    cutoff.getTime(),
  )
}

export async function runTranslationStuckSweep(
  db: Db,
  opts: { now: number; dryRun?: boolean },
): Promise<StuckSweepResult> {
  const cutoff = new Date(opts.now - STUCK_THRESHOLD_MS)

  // Heuristic: status='processing' and last heartbeat older than threshold.
  // progress_updated_at is set on queue progress/final/failure transitions.
  // Legacy rows with NULL progress_updated_at fall back to created_at.
  const stuck = await db
    .select({ id: schema.translationJobs.id })
    .from(schema.translationJobs)
    .where(
      and(
        eq(schema.translationJobs.status, "processing"),
        stuckHeartbeatCutoff(cutoff),
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
          stuckHeartbeatCutoff(cutoff),
        ),
      )
  }

  return { stuckMarkedFailed: stuck.length }
}
