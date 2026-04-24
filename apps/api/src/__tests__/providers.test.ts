import { describe, expect, it } from "vitest"
import app from "../index"

const baseEnv = {
  DB: {},
  AUTH_SECRET: "x".repeat(32),
  AUTH_BASE_URL: "http://localhost:8788",
  ALLOWED_EXTENSION_ORIGINS: "http://localhost:3000",
  BIANXIE_API_KEY: "test-bianxie-key",
  BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
  AI_JWT_SECRET: "y".repeat(32),
  BILLING_ENABLED: "false",
}

describe("GET /api/identity/providers", () => {
  it("reports OAuth providers as false when secrets are unset, and always exposes emailOtp + passkey + emailPassword", async () => {
    const res = await app.request("/api/identity/providers", {}, baseEnv)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      google: false,
      github: false,
      emailPassword: true,
      emailOtp: true,
      passkey: true,
    })
  })

  it("flags google + github when their client ids are set", async () => {
    const res = await app.request("/api/identity/providers", {}, {
      ...baseEnv,
      GOOGLE_CLIENT_ID: "g",
      GOOGLE_CLIENT_SECRET: "gs",
      GITHUB_CLIENT_ID: "h",
      GITHUB_CLIENT_SECRET: "hs",
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, boolean>
    expect(body.google).toBe(true)
    expect(body.github).toBe(true)
  })
})
