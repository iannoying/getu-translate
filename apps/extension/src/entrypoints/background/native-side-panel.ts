import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"

interface ChromeSidePanelApi {
  open?: (options: { windowId?: number, tabId?: number }) => Promise<void>
  close?: (options: { windowId?: number, tabId?: number }) => Promise<void>
  setPanelBehavior?: (behavior: { openPanelOnActionClick?: boolean }) => Promise<void>
}

interface ChromeWithSidePanel {
  sidePanel?: ChromeSidePanelApi
  windows?: {
    getCurrent?: () => Promise<{ id?: number }>
  }
}

function getChromeWithSidePanel(): ChromeWithSidePanel | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeWithSidePanel }).chrome
}

function getSidePanelApi(): ChromeSidePanelApi | undefined {
  return getChromeWithSidePanel()?.sidePanel
}

function getSenderWindowId(sender: chrome.runtime.MessageSender): number | undefined {
  return sender.tab?.windowId
}

async function getCurrentWindowId(): Promise<number | undefined> {
  return await getChromeWithSidePanel()?.windows?.getCurrent?.().then(window => window.id)
}

export function hasNativeSidePanelSupport(): boolean {
  return typeof getSidePanelApi()?.open === "function"
}

async function openNativeSidePanel(windowId: number | undefined): Promise<boolean> {
  const sidePanel = getSidePanelApi()
  if (typeof sidePanel?.open !== "function" || windowId === undefined) {
    return false
  }

  await sidePanel.open({ windowId })
  return true
}

async function closeNativeSidePanel(): Promise<boolean> {
  const sidePanel = getSidePanelApi()
  if (typeof sidePanel?.close !== "function") {
    return false
  }

  const windowId = await getCurrentWindowId()
  if (windowId === undefined) {
    return false
  }

  await sidePanel.close({ windowId })
  return true
}

export function setupNativeSidePanelHandlers() {
  const sidePanel = getSidePanelApi()
  if (typeof sidePanel?.setPanelBehavior === "function") {
    void sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch(error => logger.error("Failed to configure native side panel behavior", error))
  }

  onMessage("getNativeSidePanelSupport", async () => {
    return { supported: hasNativeSidePanelSupport() }
  })

  onMessage("openNativeSidePanel", async (message) => {
    const data = message.data as { windowId?: number } | undefined
    const windowId = data?.windowId ?? getSenderWindowId(message.sender)
    return { opened: await openNativeSidePanel(windowId) }
  })

  onMessage("closeNativeSidePanel", async () => {
    return { closed: await closeNativeSidePanel() }
  })
}
