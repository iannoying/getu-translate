import { describe, expect, it } from "vitest"
import { createRouterClient } from "@orpc/server"
import { router } from "../index"
import type { Ctx } from "../index"

function ctx(session: Ctx["session"]): Ctx {
  return { env: {} as Ctx["env"], auth: {} as Ctx["auth"], session }
}

describe("billing.getEntitlements", () => {
  it("returns free tier for any signed-in user", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1" }, session: { id: "s1" } } as any),
    })
    const e = await client.billing.getEntitlements({})
    expect(e.tier).toBe("free")
    expect(e.features).toEqual([])
    expect(e.expiresAt).toBeNull()
  })

  it("rejects anonymous", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(client.billing.getEntitlements({})).rejects.toThrow()
  })
})
