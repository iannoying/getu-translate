import type { Entitlements } from "@/types/entitlements"
import { orpcClient } from "@/utils/orpc/client"

export async function fetchEntitlementsFromBackend(): Promise<Entitlements> {
  return orpcClient.billing.getEntitlements({})
}
