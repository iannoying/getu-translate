import type { Context } from "hono"
import { eq } from "drizzle-orm"
import { createDb, schema, type Db } from "@getu/db"
import { verifyStripeSignature } from "./stripe/signature"
import { normalizeStripeEvent, type StripeNormalized } from "./stripe/events"
import { applyBillingEvent } from "./paddle/apply"
import type { BillingEvent } from "./paddle/events"
import type { WorkerEnv } from "../env"

async function resolveUserId(db: Db, subscriptionId: string): Promise<string | null> {
  const row = await db.select().from(schema.userEntitlements)
    .where(eq(schema.userEntitlements.providerSubscriptionId, subscriptionId))
    .get()
  return row?.userId ?? null
}

async function runStripeWebhook(
  c: Context<{ Bindings: WorkerEnv }>,
  db: Db,
): Promise<Response> {
  const raw = await c.req.raw.clone().text()
  const header = c.req.header("Stripe-Signature") ?? null
  const ok = await verifyStripeSignature({ header, rawBody: raw, secret: c.env.STRIPE_WEBHOOK_SECRET })
  if (!ok) return c.json({ error: "invalid_signature" }, 400)

  let evt: any
  try { evt = JSON.parse(raw) } catch { return c.json({ error: "bad_json" }, 400) }
  const eventId = evt?.id
  if (!eventId) return c.json({ error: "missing_event_id" }, 400)

  // Atomic idempotency via INSERT OR IGNORE + returning
  let inserted
  try {
    inserted = await db.insert(schema.billingWebhookEvents).values({
      eventId,
      provider: "stripe",
      eventType: evt.type ?? "unknown",
      payloadJson: raw,
      status: "received",
    }).onConflictDoNothing().returning({ eventId: schema.billingWebhookEvents.eventId })
  } catch (err) {
    console.error("[stripe-webhook] insert event failed", err)
    return c.json({ error: "insert_failed" }, 500)
  }
  if (!inserted || inserted.length === 0) {
    return c.json({ ok: true, duplicate: true })
  }

  try {
    let normalized: StripeNormalized = normalizeStripeEvent(evt)
    if (normalized.kind === "needs_lookup") {
      const userId = await resolveUserId(db, normalized.subscriptionId)
      if (userId) {
        normalized = normalizeStripeEvent(evt, { userId })
      } else {
        normalized = { kind: "ignored", reason: `user lookup failed for sub ${normalized.subscriptionId}` }
      }
    }
    // Narrow: everything left is BillingEvent
    await applyBillingEvent(db, normalized as BillingEvent, "stripe")
    await db.update(schema.billingWebhookEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(schema.billingWebhookEvents.eventId, eventId))
    return c.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.update(schema.billingWebhookEvents)
      .set({ status: "error", errorMessage: msg.slice(0, 500) })
      .where(eq(schema.billingWebhookEvents.eventId, eventId))
    console.error("[stripe-webhook] apply failed", err)
    return c.json({ error: "apply_failed" }, 500)
  }
}

export async function handleStripeWebhook(c: Context<{ Bindings: WorkerEnv }>) {
  const db = createDb(c.env.DB)
  return runStripeWebhook(c, db)
}

/** For tests: inject a pre-constructed db instance. */
export function createHandleStripeWebhook(db: Db) {
  return (c: Context<{ Bindings: WorkerEnv }>) => runStripeWebhook(c, db)
}
