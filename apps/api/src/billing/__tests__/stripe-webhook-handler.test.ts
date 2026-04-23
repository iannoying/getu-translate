import { beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { schema } from "@getu/db"
import { createHandleStripeWebhook } from "../stripe-webhook-handler"
import { makeTestDb } from "../../__tests__/utils/test-db"

const WEBHOOK_SECRET = "test_stripe_webhook_secret_xxxxx"

async function signHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function makeStripeHeader(secret: string, body: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000)
  const v1 = await signHmac(secret, `${ts}.${body}`)
  return `t=${ts},v1=${v1}`
}

function makeApp(db: ReturnType<typeof makeTestDb>["db"]) {
  const app = new Hono<{ Bindings: { STRIPE_WEBHOOK_SECRET: string } }>()
  app.post("/api/billing/webhook/stripe", createHandleStripeWebhook(db as any))
  return app
}

const checkoutCompletedPayload = JSON.stringify({
  id: "evt_stripe_01",
  type: "checkout.session.completed",
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      client_reference_id: "u1",
      customer: "cus_01",
      subscription: "sub_stripe_01",
    },
  },
})

const subscriptionUpdatedPayload = (subscriptionId = "sub_stripe_02") => JSON.stringify({
  id: "evt_stripe_02",
  type: "customer.subscription.updated",
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: subscriptionId,
      customer: "cus_01",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      items: { data: [{ price: { id: "price_monthly" } }] },
    },
  },
})

describe("handleStripeWebhook", () => {
  let ctx: ReturnType<typeof makeTestDb>
  let app: ReturnType<typeof makeApp>

  beforeEach(() => {
    ctx = makeTestDb()
    app = makeApp(ctx.db)
    ctx.sqlite.prepare(
      "INSERT INTO user (id, email, emailVerified, name, createdAt, updatedAt) VALUES (?, ?, 0, ?, strftime('%s', 'now')*1000, strftime('%s', 'now')*1000)"
    ).run("u1", "u1@x.com", "U1")
  })

  it("invalid signature → 400", async () => {
    const res = await app.request("/api/billing/webhook/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": "t=9999,v1=deadbeef",
      },
      body: checkoutCompletedPayload,
    }, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET })
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toBe("invalid_signature")
  })

  it("valid checkout.session.completed → 200 + row with billingProvider='stripe'", async () => {
    const header = await makeStripeHeader(WEBHOOK_SECRET, checkoutCompletedPayload)
    const res = await app.request("/api/billing/webhook/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": header,
      },
      body: checkoutCompletedPayload,
    }, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET })
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.ok).toBe(true)

    const row = await ctx.db
      .select().from(schema.userEntitlements)
      .where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row).toBeDefined()
    expect(row!.tier).toBe("pro")
    expect(row!.billingProvider).toBe("stripe")
    expect(row!.providerSubscriptionId).toBe("sub_stripe_01")
  })

  it("customer.subscription.updated with pre-existing entitlement → looks up userId and applies update", async () => {
    // Seed an existing entitlement for u1 with providerSubscriptionId=sub_stripe_02
    await ctx.db.insert(schema.userEntitlements).values({
      userId: "u1",
      tier: "pro",
      features: JSON.stringify([]),
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      providerCustomerId: "cus_01",
      providerSubscriptionId: "sub_stripe_02",
      billingProvider: "stripe",
      graceUntil: null,
      updatedAt: new Date(),
    })

    const payload = subscriptionUpdatedPayload("sub_stripe_02")
    const header = await makeStripeHeader(WEBHOOK_SECRET, payload)
    const res = await app.request("/api/billing/webhook/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": header,
      },
      body: payload,
    }, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET })
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.ok).toBe(true)

    // Verify the webhook event row is marked processed
    const evtRow = await ctx.db
      .select().from(schema.billingWebhookEvents)
      .where(eq(schema.billingWebhookEvents.eventId, "evt_stripe_02")).get()
    expect(evtRow?.status).toBe("processed")
  })

  it("customer.subscription.updated with NO matching entitlement → ignored, returns 200", async () => {
    // No entitlement seeded, so resolveUserId will return null → ignored
    const payload = subscriptionUpdatedPayload("sub_stripe_unknown")
    // Use a different event id to avoid conflict
    const payloadObj = JSON.parse(payload)
    payloadObj.id = "evt_stripe_03"
    const payloadStr = JSON.stringify(payloadObj)

    const header = await makeStripeHeader(WEBHOOK_SECRET, payloadStr)
    const res = await app.request("/api/billing/webhook/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": header,
      },
      body: payloadStr,
    }, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET })
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.ok).toBe(true)

    // Row should be stored (processed)
    const evtRow = await ctx.db
      .select().from(schema.billingWebhookEvents)
      .where(eq(schema.billingWebhookEvents.eventId, "evt_stripe_03")).get()
    expect(evtRow).toBeDefined()
    expect(evtRow?.status).toBe("processed")
  })

  it("duplicate event → 200 duplicate:true", async () => {
    const header1 = await makeStripeHeader(WEBHOOK_SECRET, checkoutCompletedPayload)
    await app.request("/api/billing/webhook/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": header1 },
      body: checkoutCompletedPayload,
    }, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET })

    // Second request with same event id
    const header2 = await makeStripeHeader(WEBHOOK_SECRET, checkoutCompletedPayload)
    const res2 = await app.request("/api/billing/webhook/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": header2 },
      body: checkoutCompletedPayload,
    }, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET })

    expect(res2.status).toBe(200)
    const json2 = await res2.json() as any
    expect(json2.duplicate).toBe(true)
  })
})
