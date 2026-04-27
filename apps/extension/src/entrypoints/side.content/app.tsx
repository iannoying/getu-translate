import FrogToast from "@/components/frog-toast"
import FloatingButton from "./components/floating-button"
import SideContent from "./components/side-content"
import { SidebarOpenMessageBridge } from "./components/sidebar-open-message-bridge"

export default function App() {
  return (
    <>
      <SidebarOpenMessageBridge />
      <FloatingButton />
      <SideContent />
      <FrogToast />
    </>
  )
}
