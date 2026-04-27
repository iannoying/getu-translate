import { sign, verify } from "hono/jwt"

export const AI_JWT_TTL_SECONDS = 15 * 60
export const AI_PROXY_QUOTA_BUCKETS = [
  "ai_translate_monthly",
  "web_text_translate_token_monthly",
] as const
export type AiProxyQuotaBucket = typeof AI_PROXY_QUOTA_BUCKETS[number]

export function isAiProxyQuotaBucket(value: unknown): value is AiProxyQuotaBucket {
  return typeof value === "string" && AI_PROXY_QUOTA_BUCKETS.includes(value as AiProxyQuotaBucket)
}

export async function signAiJwt(
  input: { userId: string; quotaBucket?: AiProxyQuotaBucket; now?: number },
  secret: string,
): Promise<string> {
  const iat = Math.floor((input.now ?? Date.now()) / 1000)
  return sign({
    sub: input.userId,
    quota_bucket: input.quotaBucket ?? "ai_translate_monthly",
    iat,
    exp: iat + AI_JWT_TTL_SECONDS,
  }, secret)
}

export async function verifyAiJwt(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ userId: string; exp: number; quotaBucket: AiProxyQuotaBucket }> {
  // Disable hono's built-in exp check so we can use our injected nowSeconds for
  // test-time determinism. We perform our own expiry check immediately after.
  const payload = (await verify(token, secret, { alg: "HS256", exp: false })) as {
    sub: string
    exp: number
    quota_bucket?: unknown
  }
  if (payload.exp <= nowSeconds) throw new Error("JWT expired")
  const quotaBucket = isAiProxyQuotaBucket(payload.quota_bucket)
    ? payload.quota_bucket
    : "ai_translate_monthly"
  return { userId: payload.sub, exp: payload.exp, quotaBucket }
}
