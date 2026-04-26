import app from "./index"
import { createDb } from "@getu/db"
import { runRetention } from "./scheduled/retention"
import { createQueueHandler } from "./queue/translate-document"
import type { WorkerEnv } from "./env"

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    const db = createDb(env.DB)
    ctx.waitUntil(runRetention(db, { now: Date.now(), retentionDays: 30 }))
  },
  async queue(batch: MessageBatch<{ jobId: string }>, env: WorkerEnv, ctx: ExecutionContext) {
    const bucket = env.BUCKET_PDFS
    if (!bucket) {
      // Dev or misconfigured environment without R2 — ack to avoid retry loops.
      console.warn("[worker.queue] BUCKET_PDFS not bound, acking all messages")
      for (const m of batch.messages) m.ack()
      return
    }
    const db = createDb(env.DB)
    const handler = createQueueHandler({ db, bucket, env })
    return handler.queue(batch, env, ctx)
  },
} satisfies ExportedHandler<WorkerEnv, { jobId: string }>
