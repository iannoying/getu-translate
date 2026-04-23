interface VerifyInput {
  header: string | null
  rawBody: string
  secret: string
  now?: () => number // ms
  toleranceMs?: number
}

export async function verifyStripeSignature({
  header, rawBody, secret,
  now = Date.now, toleranceMs = 5 * 60_000,
}: VerifyInput): Promise<boolean> {
  if (!header) return false

  const pairs = header.split(",").map(p => p.split("=").map(s => s.trim())).filter(a => a.length === 2)
  let ts: number | null = null
  const v1s: string[] = []
  for (const [k, v] of pairs) {
    if (k === "t" && ts === null) ts = Number.parseInt(v, 10)
    if (k === "v1") v1s.push(v)
  }
  if (ts === null || !Number.isFinite(ts) || v1s.length === 0) return false
  if (Math.abs(now() - ts * 1000) > toleranceMs) return false

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${rawBody}`))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
  // Accept if ANY provided v1 matches (key rotation safe)
  return v1s.some(v => timingSafeEqual(hex, v))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let res = 0
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return res === 0
}
