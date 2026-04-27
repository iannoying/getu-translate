import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { logger } from "@/utils/logger"

type RefetchSession = () => Promise<void> | void

export function useAuthRefreshOnFocus(_userId: string | null, refetchSession: RefetchSession): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return

    async function refreshAuthState() {
      if (document.visibilityState === "hidden")
        return

      try {
        await refetchSession()
        await queryClient.invalidateQueries({ queryKey: ["entitlements"] as const })
      }
      catch (error) {
        logger.warn("[auth] refresh on focus failed", error)
      }
    }

    function handleRefreshEvent() {
      void refreshAuthState()
    }

    window.addEventListener("focus", handleRefreshEvent)
    document.addEventListener("visibilitychange", handleRefreshEvent)

    return () => {
      window.removeEventListener("focus", handleRefreshEvent)
      document.removeEventListener("visibilitychange", handleRefreshEvent)
    }
  }, [queryClient, refetchSession])
}
