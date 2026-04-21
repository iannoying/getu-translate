import type { ReactNode } from "react"
import type { FeatureKey } from "@/types/entitlements"
import { useEntitlements } from "@/hooks/use-entitlements"
import { hasFeature } from "@/types/entitlements"
import { authClient } from "@/utils/auth/auth-client"

interface ProGateProps {
  feature: FeatureKey
  fallback: ReactNode
  children: ReactNode
}

export function ProGate({ feature, fallback, children }: ProGateProps) {
  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const { data, isLoading } = useEntitlements(userId)

  if (isLoading) {
    return fallback
  }

  if (hasFeature(data, feature)) {
    return children
  }

  return fallback
}
