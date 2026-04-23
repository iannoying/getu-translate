import { Hono } from "hono"
import { cors } from "hono/cors"
import { RPCHandler } from "@orpc/server/fetch"
import { createAuth } from "./auth"
import type { WorkerEnv } from "./env"
import { router } from "./orpc"
import { handleChatCompletions } from "./ai/proxy"
import { signAiJwt, AI_JWT_TTL_SECONDS } from "./ai/jwt"
import { handlePaddleWebhook } from "./billing/webhook-handler"
import { handleStripeWebhook } from "./billing/stripe-webhook-handler"

const app = new Hono<{ Bindings: WorkerEnv }>()

function makeCorsMw(env: WorkerEnv) {
  const allowed = env.ALLOWED_EXTENSION_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  return cors({
    origin: (origin) => {
      if (!origin) return null
      if (allowed.some((pat) => {
        if (pat === origin) return true
        if (pat === "chrome-extension://*" && origin.startsWith("chrome-extension://")) return true
        return false
      })) return origin
      return null
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Cookie"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
}

app.use("/api/identity/*", async (c, next) => makeCorsMw(c.env)(c, next))
app.use("/orpc/*", async (c, next) => makeCorsMw(c.env)(c, next))

app.get("/health", c => c.json({ ok: true, service: "getu-api" }))

app.get("/api/identity/providers", c => c.json({
  google: !!c.env.GOOGLE_CLIENT_ID,
  github: !!c.env.GITHUB_CLIENT_ID,
}))

app.all("/api/identity/*", async (c) => {
  try {
    const auth = createAuth(c.env)
    return auth.handler(c.req.raw)
  } catch (err) {
    console.error("[auth] handler threw", err)
    return c.json({ error: "internal_error" }, 500)
  }
})

const rpcHandler = new RPCHandler(router)

app.all("/orpc/*", async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null)
  const ctx = { env: c.env, auth, session }
  const { response } = await rpcHandler.handle(c.req.raw, { prefix: "/orpc", context: ctx })
  return response ?? c.notFound()
})

app.use("/ai/*", async (c, next) => makeCorsMw(c.env)(c, next))

app.post("/ai/v1/token", async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null)
  if (!session?.user) return c.json({ error: "unauthorized" }, 401)
  const token = await signAiJwt({ userId: session.user.id }, c.env.AI_JWT_SECRET)
  return c.json({ token, expires_in: AI_JWT_TTL_SECONDS })
})

app.post("/ai/v1/chat/completions", async (c) => {
  return handleChatCompletions(c.req.raw, c.env, c.executionCtx)
})

app.post("/api/billing/webhook/paddle", handlePaddleWebhook)
app.post("/api/billing/webhook/stripe", handleStripeWebhook)

export default app
