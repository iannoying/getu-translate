import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRouterClient } from "@orpc/server"
import { router } from "../index"
import type { Ctx } from "../context"
import { FREE_ENTITLEMENTS } from "@getu/contract"

vi.mock("@getu/db", async (orig) => {
  const actual = await orig<typeof import("@getu/db")>()
  return { ...actual, createDb: vi.fn(() => ({} as any)) }
})
vi.mock("../../billing/entitlements", () => ({
  loadEntitlements: vi.fn(async () => FREE_ENTITLEMENTS),
}))

function ctx(session: Ctx["session"]): Ctx {
  return { env: { DB: {} as any } as Ctx["env"], auth: {} as Ctx["auth"], session }
}

beforeEach(() => vi.clearAllMocks())

describe("billing.getEntitlements", () => {
  it("returns free tier for any signed-in user", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1" }, session: { id: "s1" } } as any),
    })
    const e = await client.billing.getEntitlements({})
    expect(e).toEqual(FREE_ENTITLEMENTS)
  })

  it("passes session.user.id to loadEntitlements", async () => {
    const { loadEntitlements } = await import("../../billing/entitlements")
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u42" }, session: { id: "s1" } } as any),
    })
    await client.billing.getEntitlements({})
    expect(loadEntitlements).toHaveBeenCalledWith(expect.anything(), "u42")
  })

  it("rejects anonymous", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(client.billing.getEntitlements({})).rejects.toThrow()
  })
})
