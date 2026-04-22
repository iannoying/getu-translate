import { beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { schema } from "@getu/db"
import { applyBillingEvent } from "../apply"
import { makeTestDb } from "../../../__tests__/utils/test-db"

describe("applyBillingEvent", () => {
  let ctx: ReturnType<typeof makeTestDb>
  beforeEach(() => {
    ctx = makeTestDb()
    ctx.sqlite.prepare(
      "INSERT INTO user (id, email, emailVerified, name, createdAt, updatedAt) VALUES (?, ?, 0, ?, strftime('%s', 'now')*1000, strftime('%s', 'now')*1000)"
    ).run("u1", "u1@x.com", "U1")
  })

  it("subscription_activated inserts pro row with correct features", async () => {
    const expiresAt = Date.now() + 30 * 86400_000
    await applyBillingEvent(ctx.db as any, {
      kind: "subscription_activated",
      userId: "u1", customerId: "ctm_01", subscriptionId: "sub_01",
      expiresAt, priceId: "pri_m",
    })
    const row = await ctx.db
      .select().from(schema.userEntitlements)
      .where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row!.tier).toBe("pro")
    expect(row!.billingProvider).toBe("paddle")
    expect(row!.providerCustomerId).toBe("ctm_01")
    expect(row!.providerSubscriptionId).toBe("sub_01")
    const features = JSON.parse(row!.features)
    expect(features).toContain("ai_translate_pool")
    expect(features).toContain("pdf_translate_unlimited")
    expect(features).toContain("pdf_translate_export")
  })

  it("subscription_updated updates expiresAt only", async () => {
    await applyBillingEvent(ctx.db as any, {
      kind: "subscription_activated",
      userId: "u1", customerId: "ctm_01", subscriptionId: "sub_01",
      expiresAt: Date.now() + 30 * 86400_000, priceId: "pri_m",
    })
    const newExpiry = Date.now() + 60 * 86400_000
    await applyBillingEvent(ctx.db as any, {
      kind: "subscription_updated",
      userId: "u1", subscriptionId: "sub_01", expiresAt: newExpiry, priceId: "pri_y",
    })
    const row = await ctx.db
      .select().from(schema.userEntitlements)
      .where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row!.tier).toBe("pro")
    const actualExpiry = row!.expiresAt instanceof Date
      ? row!.expiresAt.getTime()
      : (row!.expiresAt as unknown as number)
    expect(actualExpiry).toBeCloseTo(newExpiry, -3)
  })

  it("subscription_canceled flips tier=free but keeps customer id", async () => {
    await applyBillingEvent(ctx.db as any, {
      kind: "subscription_activated",
      userId: "u1", customerId: "ctm_01", subscriptionId: "sub_01",
      expiresAt: Date.now() + 30 * 86400_000, priceId: "pri_m",
    })
    await applyBillingEvent(ctx.db as any, {
      kind: "subscription_canceled",
      userId: "u1", subscriptionId: "sub_01",
    })
    const row = await ctx.db
      .select().from(schema.userEntitlements)
      .where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row!.tier).toBe("free")
    expect(JSON.parse(row!.features)).toEqual([])
    expect(row!.providerCustomerId).toBe("ctm_01")
    expect(row!.providerSubscriptionId).toBeNull()
  })

  it("payment_past_due sets grace_until but keeps tier=pro", async () => {
    await applyBillingEvent(ctx.db as any, {
      kind: "subscription_activated",
      userId: "u1", customerId: "ctm_01", subscriptionId: "sub_01",
      expiresAt: Date.now() + 30 * 86400_000, priceId: "pri_m",
    })
    const grace = Date.now() + 7 * 86400_000
    await applyBillingEvent(ctx.db as any, {
      kind: "payment_past_due",
      userId: "u1", subscriptionId: "sub_01", graceUntil: grace,
    })
    const row = await ctx.db
      .select().from(schema.userEntitlements)
      .where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row!.tier).toBe("pro")
    const actualGrace = row!.graceUntil instanceof Date
      ? row!.graceUntil.getTime()
      : (row!.graceUntil as unknown as number)
    expect(actualGrace).toBeCloseTo(grace, -3)
  })

  it("payment_succeeded clears grace_until", async () => {
    await applyBillingEvent(ctx.db as any, {
      kind: "subscription_activated",
      userId: "u1", customerId: "ctm_01", subscriptionId: "sub_01",
      expiresAt: Date.now() + 30 * 86400_000, priceId: "pri_m",
    })
    await applyBillingEvent(ctx.db as any, {
      kind: "payment_past_due",
      userId: "u1", subscriptionId: "sub_01", graceUntil: Date.now() + 7 * 86400_000,
    })
    await applyBillingEvent(ctx.db as any, {
      kind: "payment_succeeded",
      userId: "u1", subscriptionId: "sub_01",
    })
    const row = await ctx.db
      .select().from(schema.userEntitlements)
      .where(eq(schema.userEntitlements.userId, "u1")).get()
    expect(row!.graceUntil).toBeNull()
  })

  it("ignored events are no-op (no row changes)", async () => {
    await applyBillingEvent(ctx.db as any, { kind: "ignored", reason: "whatever" })
    const rows = await ctx.db.select().from(schema.userEntitlements).all()
    expect(rows).toEqual([])
  })
})
