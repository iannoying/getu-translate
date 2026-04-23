import { describe, expect, it } from "vitest"
import { verifyStripeSignature } from "../signature"

async function signHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
}

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_stripe_signing_secret_xxx"
  const body = '{"id":"evt_01","type":"checkout.session.completed"}'

  it("accepts a valid signature", async () => {
    const t = Math.floor(Date.now() / 1000)
    const v1 = await signHmac(secret, `${t}.${body}`)
    const header = `t=${t},v1=${v1}`
    await expect(verifyStripeSignature({ header, rawBody: body, secret })).resolves.toBe(true)
  })

  it("rejects stale timestamp (>5min)", async () => {
    const t = Math.floor(Date.now() / 1000) - 400
    const v1 = await signHmac(secret, `${t}.${body}`)
    const header = `t=${t},v1=${v1}`
    await expect(verifyStripeSignature({ header, rawBody: body, secret })).resolves.toBe(false)
  })

  it("rejects wrong signature", async () => {
    const t = Math.floor(Date.now() / 1000)
    const header = `t=${t},v1=deadbeef`
    await expect(verifyStripeSignature({ header, rawBody: body, secret })).resolves.toBe(false)
  })

  it("rejects malformed header", async () => {
    await expect(verifyStripeSignature({ header: "garbage", rawBody: body, secret })).resolves.toBe(false)
  })

  it("rejects null header", async () => {
    await expect(verifyStripeSignature({ header: null, rawBody: body, secret })).resolves.toBe(false)
  })

  it("accepts any matching v1 when multiple are present (key rotation)", async () => {
    const t = Math.floor(Date.now() / 1000)
    const v1good = await signHmac(secret, `${t}.${body}`)
    const header = `t=${t},v1=deadbeef,v1=${v1good}`
    await expect(verifyStripeSignature({ header, rawBody: body, secret })).resolves.toBe(true)
  })
})
