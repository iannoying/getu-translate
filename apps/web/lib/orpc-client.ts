import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ORPCRouterClient } from "@getu/contract"

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8788"

export const orpcClient: ORPCRouterClient = createORPCClient(
  new RPCLink({
    url: `${baseUrl}/orpc`,
    fetch: (req, init) => fetch(req, { ...init, credentials: "include" }),
  }),
)
