import type { FeatureKey } from "@/types/entitlements"
import { useCallback, useState } from "react"
import { useEntitlements } from "@/hooks/use-entitlements"
import { hasFeature } from "@/types/entitlements"
import { authClient } from "@/utils/auth/auth-client"

interface UseProGuardResult {
  /**
   * True while the session or entitlements are still resolving. Callers
   *  should disable gated UI until this is false.
   */
  isLoading: boolean
  /**
   * Returns true if feature granted and false otherwise. During loading
   *  returns false but does NOT open the upgrade dialog (caller should
   *  check `isLoading` first and show a spinner / disable the button).
   */
  guard: (feature: FeatureKey, options?: { source?: string }) => boolean
  /** Dialog state + props to spread into <UpgradeDialog />. */
  dialogProps: {
    open: boolean
    onOpenChange: (open: boolean) => void
    source?: string
  }
}

export function useProGuard(): UseProGuardResult {
  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const sessionLoading = session?.isPending ?? false
  const { data, isLoading: entitlementsLoading } = useEntitlements(userId)

  const isLoading = sessionLoading || entitlementsLoading

  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<string | undefined>(undefined)

  const guard = useCallback(
    (feature: FeatureKey, options?: { source?: string }): boolean => {
      if (isLoading) {
        return false
      }
      if (hasFeature(data, feature)) {
        return true
      }
      setSource(options?.source)
      setOpen(true)
      return false
    },
    [data, isLoading],
  )

  return {
    isLoading,
    guard,
    dialogProps: {
      open,
      onOpenChange: setOpen,
      source,
    },
  }
}
