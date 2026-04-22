import { ORPCError } from "@orpc/server"
import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { CreateCheckoutSessionInput } from "@getu/contract"
import type { PaddleClient } from "./paddle/client"
import type { WorkerEnv } from "../env"

const { userEntitlements } = schema

interface CheckoutDeps {
  db: Db
  paddle: PaddleClient
  env: WorkerEnv
  userId: string
  userEmail: string
  input: CreateCheckoutSessionInput
}

export async function createCheckoutSession(deps: CheckoutDeps): Promise<{ url: string }> {
  const { db, paddle, env, userId, userEmail, input } = deps

  if (env.BILLING_ENABLED !== "true") {
    throw new ORPCError("PRECONDITION_FAILED", { message: "Billing is not enabled" })
  }

  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  const expiresAtMs = row?.expiresAt instanceof Date
    ? row.expiresAt.getTime()
    : (row?.expiresAt as number | null | undefined) ?? null
  const hasActiveSub = row?.tier === "pro"
    && !!row.providerSubscriptionId
    && (expiresAtMs == null || expiresAtMs > Date.now())
  if (hasActiveSub) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "User already has an active Pro subscription; use createPortalSession instead",
    })
  }

  const priceId = input.plan === "pro_monthly"
    ? env.PADDLE_PRICE_PRO_MONTHLY
    : env.PADDLE_PRICE_PRO_YEARLY

  const { checkoutUrl } = await paddle.createTransaction({
    priceId,
    email: userEmail,
    userId,
    successUrl: input.successUrl,
  })
  return { url: checkoutUrl }
}

interface PortalDeps {
  db: Db
  paddle: PaddleClient
  env: WorkerEnv
  userId: string
}

export async function createPortalSession(deps: PortalDeps): Promise<{ url: string }> {
  const { db, paddle, userId } = deps
  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  if (!row?.providerCustomerId) {
    throw new ORPCError("PRECONDITION_FAILED", { message: "No billing customer on file" })
  }
  return paddle.createPortalSession({
    customerId: row.providerCustomerId,
    subscriptionIds: row.providerSubscriptionId ? [row.providerSubscriptionId] : undefined,
  })
}
