import { browser, storage } from "#imports"
import { SIDEBAR_OPEN_STORAGE_KEY } from "@/utils/constants/storage-keys"
import { swallowExtensionLifecycleError } from "@/utils/extension-lifecycle"
import { sendMessage } from "@/utils/message"

async function isSidebarPersistedOpen(): Promise<boolean> {
  return (await storage.getItem<boolean>(SIDEBAR_OPEN_STORAGE_KEY)) === true
}

async function syncSidebarOpenToTab(tabId: number) {
  if (!(await isSidebarPersistedOpen())) {
    return
  }

  await sendMessage("setSidebarOpenOnContentScript", { open: true }, tabId)
}

function syncSidebarOpenToTabSafely(tabId: number) {
  void syncSidebarOpenToTab(tabId)
    .catch(swallowExtensionLifecycleError("sidebar open sync to active tab"))
}

export function setupSidebarOpenSync() {
  browser.tabs.onActivated.addListener((activeInfo) => {
    syncSidebarOpenToTabSafely(activeInfo.tabId)
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab.active) {
      return
    }

    syncSidebarOpenToTabSafely(tabId)
  })
}
