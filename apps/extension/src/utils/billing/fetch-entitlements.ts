import type { Entitlements } from "@/types/entitlements"

export class BillingNotImplementedError extends Error {
  constructor() {
    super("billing.getEntitlements not implemented yet on backend")
  }
}

/**
 * Fetch the current user's entitlements from the backend.
 *
 * TODO(backend): once `billing.getEntitlements` is live, replace the body with:
 *   return EntitlementsSchema.parse(await orpcClient.billing.getEntitlements())
 *
 * Callers must handle `BillingNotImplementedError` (and any other error) by
 * falling back to the Dexie cache or `FREE_ENTITLEMENTS`.
 */
export async function fetchEntitlementsFromBackend(): Promise<Entitlements> {
  throw new BillingNotImplementedError()
}
