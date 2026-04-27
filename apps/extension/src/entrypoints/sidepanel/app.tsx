import { SidebarShell } from "@/entrypoints/side.content/components/side-content/sidebar-shell"
import { swallowExtensionLifecycleError } from "@/utils/extension-lifecycle"
import { sendMessage } from "@/utils/message"

export default function App() {
  function closePanel() {
    void sendMessage("closeNativeSidePanel", undefined)
      .catch(swallowExtensionLifecycleError("native side panel close"))
  }

  return (
    <div className="h-screen min-h-0 bg-background text-foreground">
      <SidebarShell portalContainer={document.body} onClose={closePanel} />
    </div>
  )
}
