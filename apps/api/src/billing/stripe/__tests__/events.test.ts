import { describe, expect, it } from "vitest"
import { normalizeStripeEvent } from "../events"

describe("normalizeStripeEvent", () => {
  it("checkout.session.completed → subscription_activated with client_reference_id", () => {
    const out = normalizeStripeEvent({
      id: "evt_01",
      type: "checkout.session.completed",
      created: 1720000000,
      data: {
        object: {
          client_reference_id: "user_01",
          customer: "cus_01",
          subscription: "sub_01",
          mode: "subscription",
        },
      },
    })
    expect(out).toMatchObject({
      kind: "subscription_activated",
      userId: "user_01",
      customerId: "cus_01",
      subscriptionId: "sub_01",
    })
  })

  it("customer.subscription.updated → needs_lookup (no userId in event)", () => {
    const out = normalizeStripeEvent({
      id: "evt_02",
      type: "customer.subscription.updated",
      created: 1720000000,
      data: {
        object: {
          id: "sub_01",
          customer: "cus_01",
          current_period_end: 1750000000,
          items: { data: [{ price: { id: "price_m" } }] },
        },
      },
    })
    expect(out.kind).toBe("needs_lookup")
    expect((out as any).subscriptionId).toBe("sub_01")
    expect((out as any).eventType).toBe("customer.subscription.updated")
  })

  it("customer.subscription.updated WITH injected userId → subscription_updated", () => {
    const out = normalizeStripeEvent({
      id: "evt_02",
      type: "customer.subscription.updated",
      created: 1720000000,
      data: {
        object: {
          id: "sub_01",
          customer: "cus_01",
          current_period_end: 1750000000,
          items: { data: [{ price: { id: "price_m" } }] },
        },
      },
    }, { userId: "user_01" })
    expect(out).toMatchObject({
      kind: "subscription_updated",
      userId: "user_01",
      subscriptionId: "sub_01",
      expiresAt: 1750000000 * 1000,
    })
  })

  it("customer.subscription.deleted WITH userId → subscription_canceled", () => {
    const out = normalizeStripeEvent({
      id: "evt_03",
      type: "customer.subscription.deleted",
      created: 1720000000,
      data: { object: { id: "sub_01" } },
    }, { userId: "user_01" })
    expect(out).toMatchObject({ kind: "subscription_canceled", userId: "user_01", subscriptionId: "sub_01" })
  })

  it("invoice.payment_failed WITH userId → payment_past_due with +7d grace", () => {
    const created = 1720000000
    const out = normalizeStripeEvent({
      id: "evt_04",
      type: "invoice.payment_failed",
      created,
      data: { object: { subscription: "sub_01" } },
    }, { userId: "user_01" })
    expect(out).toMatchObject({
      kind: "payment_past_due",
      userId: "user_01",
      subscriptionId: "sub_01",
      graceUntil: created * 1000 + 7 * 86400_000,
    })
  })

  it("invoice.payment_succeeded WITH userId → payment_succeeded", () => {
    const out = normalizeStripeEvent({
      id: "evt_05",
      type: "invoice.payment_succeeded",
      created: 1720000000,
      data: { object: { subscription: "sub_01" } },
    }, { userId: "user_01" })
    expect(out).toMatchObject({ kind: "payment_succeeded", userId: "user_01", subscriptionId: "sub_01" })
  })

  it("unknown event → ignored", () => {
    const out = normalizeStripeEvent({
      id: "evt_x",
      type: "charge.refunded",
      created: 1720000000,
      data: { object: {} },
    })
    expect(out.kind).toBe("ignored")
  })

  it("missing type → ignored", () => {
    const out = normalizeStripeEvent({ id: "evt_x", data: { object: {} } })
    expect(out.kind).toBe("ignored")
  })
})
