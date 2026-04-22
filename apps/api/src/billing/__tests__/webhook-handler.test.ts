import { beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { schema } from "@getu/db"
import { createHandlePaddleWebhook } from "../webhook-handler"
import { makeTestDb } from "../../__tests__/utils/test-db"

const WEBHOOK_SECRET = "test_webhook_secret_value_xxxxx"

async function signHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function makePaddleHeader(secret: string, body: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000)
  const h1 = await signHmac(secret, `${ts}:${body}`)
  return `ts=${ts};h1=${h1}`
}

function makeApp(db: ReturnType<typeof makeTestDb>["db"]) {
  const app = new Hono<{ Bindings: { PADDLE_WEBHOOK_SECRET: string } }>()
  app.post("/api/billing/webhook/paddle", createHandlePaddleWebhook(db as any))
  return app
}

const subActivatedPayload = JSON.stringify({
  event_id: "evt_test_01",
  event_type: "subscription.activated",
  occurred_at: "2026-05-01T00:00:00.000Z",
  data: {
    id: "sub_01",
    customer_id: "ctm_01",
    status: "active",
    current_billing_period: { ends_at: "2026-06-01T00:00:00.000Z" },
    items: [{ price: { id: "pri_m" } }],
    custom_data: { user_id: "u1" },
  },
})

describe("handlePaddleWebhook", () => {
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
    const res = await app.request("/api/billing/webhook/paddle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Paddle-Signature": "ts=9999;h1=deadbeef",
        "PADDLE_WEBHOOK_SECRET": WEBHOOK_SECRET,
      },
      body: subActivatedPayload,
    }, { PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET })
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toBe("invalid_signature")
  })

  it("missing event_id → 400", async () => {
    const payload = JSON.stringify({ event_type: "subscription.activated", data: {} })
    const header = await makePaddleHeader(WEBHOOK_SECRET, payload)
    const res = await app.request("/api/billing/webhook/paddle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Paddle-Signature": header,
      },
      body: payload,
    }, { PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET })
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toBe("missing_event_id")
  })

  it("valid signature + subscription.activated → 200 + user_entitlements row written", async () => {
    const header = await makePaddleHeader(WEBHOOK_SECRET, subActivatedPayload)
    const res = await app.request("/api/billing/webhook/paddle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Paddle-Signature": header,
      },
      body: subActivatedPayload,
    }, { PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET })
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.ok).toBe(true)

    const row = await ctx.db
      .select().from(schema.userEntitlements)
      .where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row).toBeDefined()
    expect(row!.tier).toBe("pro")
    expect(row!.providerSubscriptionId).toBe("sub_01")
  })

  it("duplicate event_id → 200 duplicate:true, no second apply", async () => {
    const header1 = await makePaddleHeader(WEBHOOK_SECRET, subActivatedPayload)
    await app.request("/api/billing/webhook/paddle", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Paddle-Signature": header1 },
      body: subActivatedPayload,
    }, { PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET })

    // Second request with same event_id
    const header2 = await makePaddleHeader(WEBHOOK_SECRET, subActivatedPayload)
    const res2 = await app.request("/api/billing/webhook/paddle", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Paddle-Signature": header2 },
      body: subActivatedPayload,
    }, { PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET })

    expect(res2.status).toBe(200)
    const json2 = await res2.json() as any
    expect(json2.duplicate).toBe(true)
  })
})
