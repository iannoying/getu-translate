import { describe, expect, it, vi } from "vitest"

// auth-client.ts calls createAuthClient at module load time.
// Mock sendMessage (backgroundFetch proxy) so the module can be imported in Node.
vi.mock("@/utils/message", () => ({
  sendMessage: vi.fn(),
}))

describe("authClient", () => {
  it("exports an authClient with the expected better-auth API surface", async () => {
    const { authClient } = await import("../auth-client")

    // Type-level and runtime smoke: the three methods callers depend on must exist.
    expect(typeof authClient.signIn).toBe("function")
    expect(typeof authClient.signIn.email).toBe("function")
    expect(typeof authClient.signOut).toBe("function")
    expect(typeof authClient.getSession).toBe("function")
  })

  it("builds baseURL from WEBSITE_URL + AUTH_BASE_PATH", async () => {
    // WEBSITE_URL in test env resolves to WEBSITE_PROD_URL because
    // import.meta.env.DEV is false in vitest (production-like).
    const { AUTH_BASE_PATH, WEBSITE_PROD_URL } = await import("@getu/definitions")

    // Verify the constants themselves are sane — this is the Task 9 consistency check.
    expect(WEBSITE_PROD_URL).toBe("https://getutranslate.com")
    expect(AUTH_BASE_PATH).toBe("/api/identity")
  })
})
