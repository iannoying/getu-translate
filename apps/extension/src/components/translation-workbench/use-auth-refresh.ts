import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { authClient } from "@/utils/auth/auth-client"
import { logger } from "@/utils/logger"

export function useAuthRefreshOnFocus(userId: string | null): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return

    async function refreshAuthState() {
      if (document.visibilityState === "hidden")
        return

      try {
        await authClient.getSession()
        await queryClient.invalidateQueries({ queryKey: ["entitlements", userId] as const })
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
  }, [queryClient, userId])
}
