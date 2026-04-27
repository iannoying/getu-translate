// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import App from "../app"

const sendMessageMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("@/entrypoints/side.content/components/side-content/sidebar-shell", () => ({
  SidebarShell: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>translationWorkbench.closeSidebar</button>
  ),
}))

describe("native side panel app", () => {
  it("requests native side-panel close from the shell close action", async () => {
    render(<App />)

    fireEvent.click(screen.getByText("translationWorkbench.closeSidebar"))

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith("closeNativeSidePanel", undefined)
    })
  })
})
