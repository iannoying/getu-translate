interface VerifyInput {
  header: string | null
  rawBody: string
  secret: string
  now?: () => number // ms
  toleranceMs?: number
}

export async function verifyPaddleSignature({
  header, rawBody, secret,
  now = Date.now, toleranceMs = 5 * 60_000,
}: VerifyInput): Promise<boolean> {
  if (!header) return false

  const parts = Object.fromEntries(
    header.split(";").map(p => p.split("=")).filter(a => a.length === 2).map(([k, v]) => [k.trim(), v.trim()]),
  ) as Record<string, string>
  if (!parts.ts || !parts.h1) return false

  const ts = Number.parseInt(parts.ts, 10)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(now() - ts * 1000) > toleranceMs) return false

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.ts}:${rawBody}`))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
  return timingSafeEqual(hex, parts.h1)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let res = 0
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return res === 0
}
