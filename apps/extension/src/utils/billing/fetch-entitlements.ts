import type { Entitlements } from "@/types/entitlements"
import { orpcClient } from "@/utils/orpc/client"

/**
 * Fetch the current user's entitlements from the backend via oRPC.
 *
 * Throws on network or auth errors — callers must handle errors by falling
 * back to the Dexie cache or `FREE_ENTITLEMENTS`.
 *
 * Note: `orpcClient` is typed against the legacy base contract which predates
 * the billing router.  The cast is safe — at runtime oRPC routes by path and
 * the billing procedure exists on the server.  The contract package's
 * `ORPCRouterClient` type will be updated when `base.d.ts` is regenerated.
 */
export async function fetchEntitlementsFromBackend(): Promise<Entitlements> {
  const client = orpcClient as unknown as {
    billing: { getEntitlements: (input: Record<string, never>) => Promise<Entitlements> }
  }
  return client.billing.getEntitlements({})
}
