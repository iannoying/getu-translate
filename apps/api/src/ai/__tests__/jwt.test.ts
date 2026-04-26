import { describe, expect, it } from "vitest"
import { signAiJwt, verifyAiJwt, AI_JWT_TTL_SECONDS } from "../jwt"

const SECRET = "a".repeat(48)

describe("aiJwt", () => {
  it("round-trips userId", async () => {
    const token = await signAiJwt({ userId: "u1", now: 1000 }, SECRET)
    const { userId, exp, quotaBucket } = await verifyAiJwt(token, SECRET, 1 + 60)
    expect(userId).toBe("u1")
    expect(quotaBucket).toBe("ai_translate_monthly")
    // now: 1000ms → iat = Math.floor(1000/1000) = 1, exp = 1 + AI_JWT_TTL_SECONDS
    expect(exp).toBe(1 + AI_JWT_TTL_SECONDS)
  })

  it("round-trips the authorized quota bucket", async () => {
    const token = await signAiJwt({
      userId: "u1",
      quotaBucket: "web_text_translate_token_monthly",
      now: 1000,
    }, SECRET)

    const verified = await verifyAiJwt(token, SECRET, 1 + 60)

    expect(verified).toMatchObject({
      userId: "u1",
      quotaBucket: "web_text_translate_token_monthly",
    })
  })

  it("rejects expired token", async () => {
    const token = await signAiJwt({ userId: "u1", now: 1000 }, SECRET)
    // nowSeconds is after exp, so our extra check throws
    await expect(verifyAiJwt(token, SECRET, 1 + AI_JWT_TTL_SECONDS + 10)).rejects.toThrow()
  })

  it("rejects wrong secret", async () => {
    const token = await signAiJwt({ userId: "u1", now: 1000 }, SECRET)
    await expect(verifyAiJwt(token, "b".repeat(48), 1 + 60)).rejects.toThrow()
  })
})
