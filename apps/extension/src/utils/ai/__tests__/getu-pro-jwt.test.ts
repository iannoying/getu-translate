import { afterEach, describe, expect, it, vi } from "vitest"
import { __clearJwtCache, getProApiBaseUrl, getProJwt } from "../getu-pro-jwt"

vi.mock("@/utils/constants/url", () => ({
  WEBSITE_URL: "https://getutranslate.com",
}))

afterEach(() => {
  __clearJwtCache()
  vi.restoreAllMocks()
})

describe("getProApiBaseUrl", () => {
  it("prod domain → api. subdomain + /ai/v1", () => {
    expect(getProApiBaseUrl()).toBe("https://api.getutranslate.com/ai/v1")
  })
})

describe("getProJwt", () => {
  it("caches JWT until near-expiry", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: "jwt-1", expires_in: 900 }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const a = await getProJwt()
    const b = await getProJwt()
    expect(a).toBe("jwt-1")
    expect(b).toBe("jwt-1")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refetches when force=true", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "jwt-1", expires_in: 900 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "jwt-2", expires_in: 900 }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const a = await getProJwt()
    const b = await getProJwt({ force: true })
    expect(a).toBe("jwt-1")
    expect(b).toBe("jwt-2")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })))
    await expect(getProJwt()).rejects.toThrow(/401/)
  })

  it("refetches when within 30s of expiry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "jwt-1", expires_in: 900 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "jwt-2", expires_in: 900 }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    // First call — populates cache
    await getProJwt()
    // Advance time so we're within 30s of expiry (expires_in=900s, so expiresAt = now+900000ms)
    // Move time to 29s before expiry: now + 900000 - 29000 = 871000ms elapsed
    const originalDateNow = Date.now
    vi.spyOn(Date, "now").mockReturnValue(originalDateNow() + 871_000)
    const c = await getProJwt()
    expect(c).toBe("jwt-2")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
