import { describe, expect, it } from "vitest"
import { verifyPaddleSignature } from "../signature"

async function signHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
}

describe("verifyPaddleSignature", () => {
  const secret = "pdl_ntfset_01test_secret_value_xxxxx"
  const body = '{"event_id":"evt_01","event_type":"subscription.activated"}'

  it("accepts a valid signature within the window", async () => {
    const ts = Math.floor(Date.now() / 1000)
    const h1 = await signHmac(secret, `${ts}:${body}`)
    const header = `ts=${ts};h1=${h1}`
    await expect(verifyPaddleSignature({ header, rawBody: body, secret })).resolves.toBe(true)
  })

  it("rejects stale timestamps (>5 min old)", async () => {
    const ts = Math.floor(Date.now() / 1000) - 400
    const h1 = await signHmac(secret, `${ts}:${body}`)
    const header = `ts=${ts};h1=${h1}`
    await expect(verifyPaddleSignature({ header, rawBody: body, secret })).resolves.toBe(false)
  })

  it("rejects invalid h1", async () => {
    const ts = Math.floor(Date.now() / 1000)
    const header = `ts=${ts};h1=deadbeefdeadbeef`
    await expect(verifyPaddleSignature({ header, rawBody: body, secret })).resolves.toBe(false)
  })

  it("rejects malformed header", async () => {
    await expect(verifyPaddleSignature({ header: "garbage", rawBody: body, secret })).resolves.toBe(false)
  })

  it("rejects null header", async () => {
    await expect(verifyPaddleSignature({ header: null, rawBody: body, secret })).resolves.toBe(false)
  })

  it("accepts custom toleranceMs override", async () => {
    const ts = Math.floor(Date.now() / 1000) - 100
    const h1 = await signHmac(secret, `${ts}:${body}`)
    const header = `ts=${ts};h1=${h1}`
    await expect(verifyPaddleSignature({
      header, rawBody: body, secret, toleranceMs: 200_000,
    })).resolves.toBe(true)
  })
})
