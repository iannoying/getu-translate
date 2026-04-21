import { Hono } from "hono"
import { cors } from "hono/cors"
import { createAuth } from "./auth"
import type { WorkerEnv } from "./env"

const app = new Hono<{ Bindings: WorkerEnv }>()

app.use("*", cors({
  origin: origin => origin, // reflected; exact allowlist enforced by better-auth trustedOrigins
  credentials: true,
}))

app.get("/health", c => c.json({ ok: true, service: "getu-api" }))

app.all("/api/identity/*", async (c) => {
  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})

export default app
