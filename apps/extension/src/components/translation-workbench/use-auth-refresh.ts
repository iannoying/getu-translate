import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { logger } from "@/utils/logger"

type RefetchSession = () => Promise<unknown> | unknown

function getObjectValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object")
    return undefined

  return (value as Record<string, unknown>)[key]
}

function getUserIdFromRefetchResult(result: unknown): string | null {
  const directUser = getObjectValue(result, "user")
  const directId = getObjectValue(directUser, "id")
  if (typeof directId === "string")
    return directId

  const data = getObjectValue(result, "data")
  const dataUser = getObjectValue(data, "user")
  const dataUserId = getObjectValue(dataUser, "id")
  if (typeof dataUserId === "string")
    return dataUserId

  return null
}

export function useAuthRefreshOnFocus(userId: string | null, refetchSession: RefetchSession): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return

    async function refreshAuthState() {
      if (document.visibilityState === "hidden")
        return

      try {
        const refetchResult = await refetchSession()
        const nextUserId = getUserIdFromRefetchResult(refetchResult)
        const userIdsToInvalidate = nextUserId !== null && nextUserId !== userId
          ? [userId, nextUserId]
          : [userId]

        await Promise.all(
          userIdsToInvalidate.map(id =>
            queryClient.invalidateQueries({ queryKey: ["entitlements", id] as const }),
          ),
        )
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
  }, [queryClient, refetchSession, userId])
}
