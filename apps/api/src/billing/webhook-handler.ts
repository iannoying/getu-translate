import type { Context } from "hono"
import { eq } from "drizzle-orm"
import { createDb, schema, type Db } from "@getu/db"
import { verifyPaddleSignature } from "./paddle/signature"
import { normalizePaddleEvent } from "./paddle/events"
import { applyBillingEvent } from "./paddle/apply"
import type { WorkerEnv } from "../env"

async function runWebhook(
  c: Context<{ Bindings: WorkerEnv }>,
  db: Db,
): Promise<Response> {
  const raw = await c.req.raw.clone().text()
  const header = c.req.header("Paddle-Signature") ?? null
  const ok = await verifyPaddleSignature({ header, rawBody: raw, secret: c.env.PADDLE_WEBHOOK_SECRET })
  if (!ok) return c.json({ error: "invalid_signature" }, 400)

  let evt: any
  try { evt = JSON.parse(raw) } catch { return c.json({ error: "bad_json" }, 400) }
  const eventId = evt?.event_id
  if (!eventId) return c.json({ error: "missing_event_id" }, 400)

  // Atomic idempotency: INSERT OR IGNORE → returning.
  // If 0 rows returned, this event_id already existed — another request
  // (or a prior processing attempt) owns it. Short-circuit to avoid
  // concurrent apply. Safer than read-then-check which has a TOCTOU window.
  let inserted
  try {
    inserted = await db.insert(schema.billingWebhookEvents).values({
      eventId,
      provider: "paddle",
      eventType: evt.event_type ?? "unknown",
      payloadJson: raw,
      status: "received",
    }).onConflictDoNothing().returning({ eventId: schema.billingWebhookEvents.eventId })
  } catch (err) {
    console.error("[paddle-webhook] insert event failed", err)
    return c.json({ error: "insert_failed" }, 500)
  }
  if (!inserted || inserted.length === 0) {
    return c.json({ ok: true, duplicate: true })
  }

  try {
    const normalized = normalizePaddleEvent(evt)
    await applyBillingEvent(db, normalized)
    await db.update(schema.billingWebhookEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(schema.billingWebhookEvents.eventId, eventId))
    return c.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.update(schema.billingWebhookEvents)
      .set({ status: "error", errorMessage: msg.slice(0, 500) })
      .where(eq(schema.billingWebhookEvents.eventId, eventId))
    console.error("[paddle-webhook] apply failed", err)
    return c.json({ error: "apply_failed" }, 500)
  }
}

export async function handlePaddleWebhook(c: Context<{ Bindings: WorkerEnv }>) {
  const db = createDb(c.env.DB)
  return runWebhook(c, db)
}

/** For tests: inject a pre-constructed db instance. */
export function createHandlePaddleWebhook(db: Db) {
  return (c: Context<{ Bindings: WorkerEnv }>) => runWebhook(c, db)
}
