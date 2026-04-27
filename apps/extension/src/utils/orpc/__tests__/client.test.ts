import { beforeEach, describe, expect, it, vi } from "vitest"

const capturedRpcLinkOptions = vi.hoisted(() => ({ current: null as null | { url?: string } }))

vi.mock("@orpc/client/fetch", () => ({
  RPCLink: vi.fn(class {
    constructor(options: { url?: string }) {
      capturedRpcLinkOptions.current = options
    }
  }),
}))

vi.mock("@orpc/client", () => ({
  createORPCClient: vi.fn(() => ({})),
}))

vi.mock("@orpc/tanstack-query", () => ({
  createTanstackQueryUtils: vi.fn(() => ({})),
}))

vi.mock("@/utils/message", () => ({
  sendMessage: vi.fn(),
}))

describe("extension oRPC client", () => {
  beforeEach(() => {
    capturedRpcLinkOptions.current = null
    vi.resetModules()
  })

  it("targets the API worker's /orpc router", async () => {
    await import("../client")

    expect(capturedRpcLinkOptions.current?.url).toMatch(/\/orpc$/)
    expect(capturedRpcLinkOptions.current?.url).not.toContain("/api/rpc")
  })
})
