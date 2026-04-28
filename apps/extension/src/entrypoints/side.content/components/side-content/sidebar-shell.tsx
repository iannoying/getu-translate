import { useSetAtom } from "jotai"
import { SidebarShell as SharedSidebarShell } from "@/components/translation-workbench/sidebar-shell"
import { isSideOpenAtom } from "../../atoms"

interface SidebarShellProps {
  portalContainer?: HTMLElement | null
  onClose?: () => void
}

export function SidebarShell({ portalContainer, onClose }: SidebarShellProps) {
  const setIsSideOpen = useSetAtom(isSideOpenAtom)

  function handleClose() {
    if (onClose) {
      onClose()
      return
    }

    void setIsSideOpen(false)
  }

  return (
    <SharedSidebarShell
      portalContainer={portalContainer}
      onClose={handleClose}
    />
  )
}
