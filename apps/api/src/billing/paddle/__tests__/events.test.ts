import { describe, expect, it } from "vitest"
import { normalizePaddleEvent } from "../events"

const base = (override: any = {}) => ({
  event_id: "evt_01",
  occurred_at: "2026-05-01T00:00:00.000Z",
  event_type: "subscription.activated",
  data: {
    id: "sub_01",
    customer_id: "ctm_01",
    status: "active",
    current_billing_period: { ends_at: "2026-06-01T00:00:00.000Z" },
    items: [{ price: { id: "pri_m" } }],
    custom_data: { user_id: "user_01" },
    ...override.data,
  },
  ...override,
})

describe("normalizePaddleEvent", () => {
  it("subscription.activated → subscription_activated with all fields", () => {
    const out = normalizePaddleEvent(base())
    expect(out).toEqual({
      kind: "subscription_activated",
      userId: "user_01",
      customerId: "ctm_01",
      subscriptionId: "sub_01",
      expiresAt: new Date("2026-06-01T00:00:00.000Z").getTime(),
      priceId: "pri_m",
    })
  })

  it("subscription.created treated same as activated", () => {
    const out = normalizePaddleEvent(base({ event_type: "subscription.created" }))
    expect(out.kind).toBe("subscription_activated")
  })

  it("subscription.updated → subscription_updated", () => {
    const out = normalizePaddleEvent(base({ event_type: "subscription.updated" }))
    expect(out.kind).toBe("subscription_updated")
    expect((out as any).userId).toBe("user_01")
  })

  it("subscription.canceled → subscription_canceled", () => {
    const out = normalizePaddleEvent(base({ event_type: "subscription.canceled" }))
    expect(out.kind).toBe("subscription_canceled")
    expect((out as any).subscriptionId).toBe("sub_01")
  })

  it("subscription.past_due → payment_past_due with +7d grace anchored on occurred_at", () => {
    // grace is anchored to occurred_at (event time), NOT current_billing_period.ends_at,
    // because past_due often fires after the billing period has already ended.
    const out = normalizePaddleEvent(base({ event_type: "subscription.past_due" }))
    expect(out.kind).toBe("payment_past_due")
    expect((out as any).graceUntil).toBe(
      new Date("2026-05-01T00:00:00.000Z").getTime() + 7 * 86400_000
    )
  })

  it("subscription.paused → payment_past_due (treated same)", () => {
    const out = normalizePaddleEvent(base({ event_type: "subscription.paused" }))
    expect(out.kind).toBe("payment_past_due")
  })

  it("transaction.completed → payment_succeeded", () => {
    const out = normalizePaddleEvent({
      event_id: "evt_tx",
      event_type: "transaction.completed",
      data: {
        id: "txn_01",
        subscription_id: "sub_01",
        custom_data: { user_id: "user_01" },
      },
    })
    expect(out.kind).toBe("payment_succeeded")
    expect((out as any).subscriptionId).toBe("sub_01")
  })

  it("unknown event types → ignored", () => {
    const out = normalizePaddleEvent(base({ event_type: "adjustment.created" }))
    expect(out.kind).toBe("ignored")
  })

  it("missing custom_data.user_id → ignored (can't map to user)", () => {
    const out = normalizePaddleEvent(base({ data: { ...base().data, custom_data: {} } }))
    expect(out.kind).toBe("ignored")
  })
})
