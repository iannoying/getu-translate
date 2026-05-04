import { withSentry } from "@sentry/cloudflare"
import app from "./index"
import { createDb } from "@getu/db"
import { runRetention } from "./scheduled/retention"
import { runSpendMonitor } from "./scheduled/spend-monitor"
import { runTranslationCleanup } from "./scheduled/translation-cleanup"
import { runTranslationRetry } from "./scheduled/translation-retry"
import { runTranslationStuckSweep } from "./scheduled/translation-stuck-sweep"
import { createQueueHandler } from "./queue/translate-document"
import type { WorkerEnv } from "./env"
import { logger } from "./analytics/logger"

const handler = {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    const db = createDb(env.DB)
    const now = Date.now()

    ctx.waitUntil(
      Promise.allSettled([
        runRetention(db, { now, retentionDays: 30 }).then(() => ({ task: "retention" as const, ok: true as const })),
        runTranslationCleanup(db, env.BUCKET_PDFS, { now }).then((r) => ({ task: "translation-cleanup" as const, ok: true as const, ...r })),
        runTranslationStuckSweep(db, { now }).then((r) => ({ task: "translation-stuck-sweep" as const, ok: true as const, ...r })),
        runTranslationRetry(db, env.TRANSLATE_QUEUE, { now }).then((r) => ({ task: "translation-retry" as const, ok: true as const, ...r })),
        runSpendMonitor(db, env, { now }).then((r) => ({ task: "spend-monitor" as const, ok: true as const, ...r })),
      ]).then((results) => {
        for (const r of results) {
          if (r.status === "fulfilled") {
            console.info("[scheduled]", r.value)
          } else {
            logger.error("[scheduled] task failed", { err: r.reason }, { env, executionCtx: ctx })
          }
        }
      }),
    )
  },
  async queue(batch: MessageBatch<{ jobId: string }>, env: WorkerEnv, ctx: ExecutionContext) {
    const bucket = env.BUCKET_PDFS
    if (!bucket) {
      // Dev or misconfigured environment without R2 — ack to avoid retry loops.
      logger.warn(
        "[worker.queue] BUCKET_PDFS not bound, acking all messages",
        {},
        { env, executionCtx: ctx },
      )
      for (const m of batch.messages) m.ack()
      return
    }
    const db = createDb(env.DB)
    const handler = createQueueHandler({ db, bucket, env })
    return handler.queue(batch, env, ctx)
  },
} satisfies ExportedHandler<WorkerEnv, { jobId: string }>

export default withSentry<WorkerEnv, { jobId: string }>(
  (env: WorkerEnv) => ({
    dsn: env.SENTRY_DSN ?? "",
    tracesSampleRate: 0,
    enabled: !!env.SENTRY_DSN,
  }),
  handler,
)
