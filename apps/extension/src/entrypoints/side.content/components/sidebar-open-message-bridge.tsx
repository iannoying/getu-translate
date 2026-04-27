import { useSetAtom } from "jotai"
import { useEffect } from "react"
import { onMessage } from "@/utils/message"
import { isSideOpenAtom } from "../atoms"

export function SidebarOpenMessageBridge() {
  const setIsSideOpen = useSetAtom(isSideOpenAtom)

  useEffect(() => {
    return onMessage("setSidebarOpenOnContentScript", (message) => {
      void setIsSideOpen(message.data.open)
    })
  }, [setIsSideOpen])

  return null
}
