import { sign, verify } from "hono/jwt"

export const AI_JWT_TTL_SECONDS = 15 * 60

export async function signAiJwt(
  input: { userId: string; now?: number },
  secret: string,
): Promise<string> {
  const iat = Math.floor((input.now ?? Date.now()) / 1000)
  return sign({ sub: input.userId, iat, exp: iat + AI_JWT_TTL_SECONDS }, secret)
}

export async function verifyAiJwt(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ userId: string; exp: number }> {
  // Disable hono's built-in exp check so we can use our injected nowSeconds for
  // test-time determinism. We perform our own expiry check immediately after.
  const payload = (await verify(token, secret, { alg: "HS256", exp: false })) as {
    sub: string
    exp: number
  }
  if (payload.exp <= nowSeconds) throw new Error("JWT expired")
  return { userId: payload.sub, exp: payload.exp }
}
