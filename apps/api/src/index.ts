import { Hono } from "hono"
import { cors } from "hono/cors"
import { createAuth } from "./auth"
import type { WorkerEnv } from "./env"

const app = new Hono<{ Bindings: WorkerEnv }>()

app.use("/api/identity/*", async (c, next) => {
  const allowed = c.env.ALLOWED_EXTENSION_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  const corsMiddleware = cors({
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
  return corsMiddleware(c, next)
})

app.get("/health", c => c.json({ ok: true, service: "getu-api" }))

app.all("/api/identity/*", async (c) => {
  try {
    const auth = createAuth(c.env)
    return auth.handler(c.req.raw)
  } catch (err) {
    console.error("[auth] handler threw", err)
    return c.json({ error: "internal_error" }, 500)
  }
})

export default app
