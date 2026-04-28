# Chrome Persistent Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the translation sidebar stay open when switching tabs in the same Chrome/Edge window by hosting it in Chrome's native global Side Panel, while keeping the existing injected sidebar as the fallback for Firefox and unsupported side-panel contexts.

**Architecture:** The current sidebar is a content-script overlay, so it is per-tab and cannot truly stay resident across browser tabs. Add a WXT `sidepanel` extension page that reuses the sidebar text/document UI, add background handlers for `chrome.sidePanel.open()` and `chrome.sidePanel.close()`, and make the floating button prefer the native global side panel on Chromium before falling back to the existing `isSideOpenAtom` overlay.

**Tech Stack:** WXT MV3, Chrome `chrome.sidePanel` API, React 19, Jotai, @webext-core/messaging, Vitest/jsdom, pnpm.

---

## Review Findings Driving This Plan

- `apps/extension/src/entrypoints/side.content/index.tsx` defines the sidebar as a content script with `matches: ["*://*/*", "file:///*"]`. This surface is injected into each page separately and cannot appear on Chrome-restricted pages, tabs without the content script, or unloaded content-script roots.
- `apps/extension/wxt.config.ts` does not currently produce `side_panel.default_path` or request the `sidePanel` permission. The extension therefore is not using Chrome's persistent side panel surface.
- `apps/extension/src/entrypoints/background/sidebar-open-sync.ts` only sends `setSidebarOpenOnContentScript` to an active tab. That can resync an already-injected content script, but it cannot create a browser-level panel that stays resident across tab switches.
- Existing tests for `sidebar-open-state`, `sidebar-open-message-bridge`, and `sidebar-open-sync` pass. The remaining issue is architectural rather than a broken storage key.

## File Structure

- Modify `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx`
  - Make the shell reusable by accepting a `portalContainer` and `onClose` prop instead of hard-coding content-script-only behavior.
- Modify `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`
  - Remove the direct `shadowWrapper` import and accept `portalContainer` as a prop.
- Modify `apps/extension/src/entrypoints/side.content/components/side-content/index.tsx`
  - Pass the content-script `shadowWrapper` to `SidebarShell`.
- Modify `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`
  - Cover the new `onClose` prop.
- Modify `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx`
  - Keep the portal-container behavior covered without mocking `shadowWrapper`.
- Create `apps/extension/src/entrypoints/sidepanel/index.html`
  - WXT side-panel entrypoint HTML.
- Create `apps/extension/src/entrypoints/sidepanel/main.tsx`
  - Native side-panel React bootstrap with config/theme/i18n hydration.
- Create `apps/extension/src/entrypoints/sidepanel/app.tsx`
  - Renders `SidebarShell` in native side-panel layout.
- Create `apps/extension/src/entrypoints/sidepanel/__tests__/app.test.tsx`
  - Verifies native close sends the close message and hides the shell only through the background contract.
- Modify `apps/extension/src/utils/message.ts`
  - Add `openNativeSidePanel`, `closeNativeSidePanel`, and `getNativeSidePanelSupport`.
- Create `apps/extension/src/entrypoints/background/native-side-panel.ts`
  - Background abstraction around `chrome.sidePanel` with feature detection and testable helpers.
- Create `apps/extension/src/entrypoints/background/__tests__/native-side-panel.test.ts`
  - Unit tests for supported/unsupported open, global `windowId` behavior, and close fallback.
- Modify `apps/extension/src/entrypoints/background/index.ts`
  - Register native side-panel message handlers during background startup.
- Modify `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx`
  - Prefer `openNativeSidePanel` from the open-panel button and click-action sidebar path, falling back to `setIsSideOpen(true)` if unavailable.
- Modify `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`
  - Verify native-open success does not open the overlay, and native-open failure falls back to overlay.

---

### Task 1: Make The Existing Sidebar UI Reusable

**Files:**
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/index.tsx`
- Test: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`
- Test: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx`

- [ ] **Step 1: Add the failing close-prop test**

Update `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx` with this test:

```tsx
it("uses the provided close handler when rendered outside the content overlay", () => {
  const store = createStore()
  const onClose = vi.fn()
  void store.set(isSideOpenAtom, true)

  render(
    <JotaiProvider store={store}>
      <SidebarShell onClose={onClose} portalContainer={document.body} />
    </JotaiProvider>,
  )

  fireEvent.click(screen.getByLabelText("translationWorkbench.closeSidebar"))

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(store.get(isSideOpenAtom)).toBe(true)
})
```

- [ ] **Step 2: Run the shell test and verify it fails**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx
```

Expected: FAIL with a TypeScript or runtime error because `SidebarShell` does not accept `onClose` or `portalContainer`.

- [ ] **Step 3: Refactor `SidebarTextTab` to accept a portal container**

In `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`, remove this import:

```ts
import { shadowWrapper } from "../../index"
```

Replace the existing `resolvePortalContainer` function and component signature with:

```tsx
interface SidebarTextTabProps {
  portalContainer?: HTMLElement | null
}

function resolvePortalContainer(portalContainer?: HTMLElement | null): HTMLElement {
  return portalContainer ?? document.body
}

export function SidebarTextTab({ portalContainer: providedPortalContainer }: SidebarTextTabProps) {
  const [language, setLanguage] = useAtom(configFieldsAtomMap.language)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const session = authClient.useSession()
  const sessionLoading = session?.isPending ?? false
  const userId = session.data?.user?.id ?? null
  useAuthRefreshOnFocus(userId, session.refetch)
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements(userId)
  const plan = planFromEntitlements(userId, entitlements)
  const charLimit = getTextTranslateCharLimit(plan)
  const authGateLoading = sessionLoading || entitlementsLoading

  const providers = useMemo<TranslateProviderConfig[]>(
    () => filterEnabledProvidersConfig(getTranslateProvidersConfig(providersConfig)) as TranslateProviderConfig[],
    [providersConfig],
  )

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null)
  const [text, setText] = useState("")
  const [results, setResults] = useState<Record<string, TranslationResultState>>({})
  const [isTranslating, setIsTranslating] = useState(false)
  const [pendingTranslation, setPendingTranslation] = useState<PendingSidebarTranslation | null>(null)
  const selectedIdsWriteVersionRef = useRef(0)
  const portalContainer = resolvePortalContainer(providedPortalContainer)
```

Keep the rest of the component body unchanged.

- [ ] **Step 4: Refactor `SidebarShell` to accept `portalContainer` and `onClose`**

Replace `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx` with:

```tsx
import { IconFileText, IconLanguage, IconX } from "@tabler/icons-react"
import { useSetAtom } from "jotai"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"
import { isSideOpenAtom } from "../../atoms"
import { SidebarDocumentTab } from "./sidebar-document-tab"
import { SidebarTextTab } from "./sidebar-text-tab"

type SidebarTab = "text" | "document"

interface SidebarShellProps {
  portalContainer?: HTMLElement | null
  onClose?: () => void
}

export function SidebarShell({ portalContainer, onClose }: SidebarShellProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("text")
  const setIsSideOpen = useSetAtom(isSideOpenAtom)

  function handleClose() {
    if (onClose) {
      onClose()
      return
    }

    void setIsSideOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <header className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-normal">
            {i18n.t("translationWorkbench.sidebarTitle")}
          </h1>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={i18n.t("translationWorkbench.closeSidebar")}
            onClick={handleClose}
          >
            <IconX className="size-4" />
          </Button>
        </header>

        {activeTab === "text"
          ? <SidebarTextTab portalContainer={portalContainer} />
          : <SidebarDocumentTab />}
      </main>

      <aside
        className="flex w-20 shrink-0 flex-col items-center gap-3 border-l border-border bg-muted/30 px-2 py-5"
        role="tablist"
        aria-label={i18n.t("translationWorkbench.sidebarTitle")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "text"}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-md px-2 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            activeTab === "text" && "bg-background text-primary shadow-xs ring-1 ring-border",
          )}
          onClick={() => setActiveTab("text")}
        >
          <IconLanguage className="size-5" />
          <span>{i18n.t("translationWorkbench.textTab")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "document"}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-md px-2 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            activeTab === "document" && "bg-background text-primary shadow-xs ring-1 ring-border",
          )}
          onClick={() => setActiveTab("document")}
        >
          <IconFileText className="size-5" />
          <span>{i18n.t("translationWorkbench.documentTab")}</span>
        </button>
      </aside>
    </div>
  )
}
```

- [ ] **Step 5: Pass the Shadow DOM wrapper from content-side `SideContent`**

In `apps/extension/src/entrypoints/side.content/components/side-content/index.tsx`, add:

```ts
import { shadowWrapper } from "../../index"
```

Then replace:

```tsx
{isSideOpen && <SidebarShell />}
```

with:

```tsx
{isSideOpen && <SidebarShell portalContainer={shadowWrapper} />}
```

- [ ] **Step 6: Run the refactor tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx apps/extension/src/entrypoints/side.content/components/side-content/index.tsx apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
git commit -m "refactor(extension): reuse sidebar shell outside content overlay"
```

---

### Task 2: Add The WXT Native Side Panel Entrypoint

**Files:**
- Create: `apps/extension/src/entrypoints/sidepanel/index.html`
- Create: `apps/extension/src/entrypoints/sidepanel/app.tsx`
- Create: `apps/extension/src/entrypoints/sidepanel/main.tsx`
- Create: `apps/extension/src/entrypoints/sidepanel/__tests__/app.test.tsx`

- [ ] **Step 1: Add the failing native side-panel app test**

Create `apps/extension/src/entrypoints/sidepanel/__tests__/app.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the side-panel app test and verify it fails**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/sidepanel/__tests__/app.test.tsx
```

Expected: FAIL with an import error for `../app`.

- [ ] **Step 3: Create the native side-panel HTML**

Create `apps/extension/src/entrypoints/sidepanel/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GetU Translate</title>
    <script type="module" src="./main.tsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

- [ ] **Step 4: Create the native side-panel app**

Create `apps/extension/src/entrypoints/sidepanel/app.tsx`:

```tsx
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
```

- [ ] **Step 5: Create the native side-panel React bootstrap**

Create `apps/extension/src/entrypoints/sidepanel/main.tsx`:

```tsx
import "@/utils/zod-config"
import type { Config } from "@/types/config/config"
import type { ThemeMode } from "@/types/config/theme"
import type { UILocalePreference } from "@/utils/i18n"
import { QueryClientProvider } from "@tanstack/react-query"
import { Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import * as React from "react"
import FrogToast from "@/components/frog-toast"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { TooltipProvider } from "@/components/ui/base-ui/tooltip"
import { configAtom } from "@/utils/atoms/config"
import { baseThemeModeAtom } from "@/utils/atoms/theme"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { baseUILocalePreferenceAtom, hydrateI18nFromStorage, I18nReactiveRoot } from "@/utils/i18n"
import { renderPersistentReactRoot } from "@/utils/react-root"
import { queryClient } from "@/utils/tanstack-query"
import { applyTheme, getLocalThemeMode, isDarkMode } from "@/utils/theme"
import App from "./app"
import "@/assets/styles/text-small.css"
import "@/assets/styles/theme.css"

function HydrateAtoms({
  initialValues,
  children,
}: {
  initialValues: [
    [typeof configAtom, Config],
    [typeof baseThemeModeAtom, ThemeMode],
    [typeof baseUILocalePreferenceAtom, UILocalePreference],
  ]
  children: React.ReactNode
}) {
  useHydrateAtoms(initialValues)
  return children
}

async function initApp() {
  const root = document.getElementById("root")!
  root.className = "text-base antialiased h-screen min-h-0 overflow-hidden bg-background"

  const [configValue, themeMode, uiLocalePref] = await Promise.all([
    getLocalConfig(),
    getLocalThemeMode(),
    hydrateI18nFromStorage(),
  ])
  const config = configValue ?? DEFAULT_CONFIG

  applyTheme(document.documentElement, isDarkMode(themeMode) ? "dark" : "light")

  renderPersistentReactRoot(root, (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <HydrateAtoms
            initialValues={[
              [configAtom, config],
              [baseThemeModeAtom, themeMode],
              [baseUILocalePreferenceAtom, uiLocalePref],
            ]}
          >
            <ThemeProvider>
              <TooltipProvider>
                <I18nReactiveRoot>
                  <App />
                  <FrogToast />
                </I18nReactiveRoot>
              </TooltipProvider>
            </ThemeProvider>
          </HydrateAtoms>
        </JotaiProvider>
      </QueryClientProvider>
    </React.StrictMode>
  ))
}

void initApp()
```

- [ ] **Step 6: Run the native side-panel app test**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/sidepanel/__tests__/app.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Verify WXT detects the sidepanel entrypoint**

Run:

```bash
pnpm --filter @getu/extension wxt prepare
```

Expected: PASS. WXT should generate extension metadata without errors and include the `sidepanel` page in generated types.

- [ ] **Step 8: Commit**

```bash
git add apps/extension/src/entrypoints/sidepanel/index.html apps/extension/src/entrypoints/sidepanel/app.tsx apps/extension/src/entrypoints/sidepanel/main.tsx apps/extension/src/entrypoints/sidepanel/__tests__/app.test.tsx
git commit -m "feat(extension): add native side panel entrypoint"
```

---

### Task 3: Add Background Native Side Panel Handlers

**Files:**
- Modify: `apps/extension/src/utils/message.ts`
- Create: `apps/extension/src/entrypoints/background/native-side-panel.ts`
- Create: `apps/extension/src/entrypoints/background/__tests__/native-side-panel.test.ts`
- Modify: `apps/extension/src/entrypoints/background/index.ts`

- [ ] **Step 1: Add the failing background tests**

Create `apps/extension/src/entrypoints/background/__tests__/native-side-panel.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const onMessageHandlers = vi.hoisted(() => new Map<string, (message: { data: unknown, sender: chrome.runtime.MessageSender }) => unknown>())

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn((type: string, handler: (message: { data: unknown, sender: chrome.runtime.MessageSender }) => unknown) => {
    onMessageHandlers.set(type, handler)
    return vi.fn()
  }),
}))

describe("native side panel background handlers", () => {
  beforeEach(() => {
    vi.resetModules()
    onMessageHandlers.clear()
    Reflect.deleteProperty(globalThis, "chrome")
  })

  it("reports unsupported when chrome.sidePanel is unavailable", async () => {
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("getNativeSidePanelSupport")

    expect(await handler?.({ data: undefined, sender: {} })).toEqual({ supported: false })
  })

  it("opens a global side panel for the sender window", async () => {
    const open = vi.fn(async () => undefined)
    Object.assign(globalThis, {
      chrome: {
        sidePanel: { open },
      },
    })
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("openNativeSidePanel")

    expect(await handler?.({
      data: undefined,
      sender: { tab: { id: 17, windowId: 91 } } as chrome.runtime.MessageSender,
    })).toEqual({ opened: true })
    expect(open).toHaveBeenCalledWith({ windowId: 91 })
  })

  it("uses an explicit window id when provided", async () => {
    const open = vi.fn(async () => undefined)
    Object.assign(globalThis, {
      chrome: {
        sidePanel: { open },
      },
    })
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("openNativeSidePanel")

    expect(await handler?.({
      data: { windowId: 34 },
      sender: { tab: { id: 17, windowId: 91 } } as chrome.runtime.MessageSender,
    })).toEqual({ opened: true })
    expect(open).toHaveBeenCalledWith({ windowId: 34 })
  })

  it("closes the current window panel when close is supported", async () => {
    const close = vi.fn(async () => undefined)
    Object.assign(globalThis, {
      chrome: {
        sidePanel: { close },
        windows: { getCurrent: vi.fn(async () => ({ id: 55 })) },
      },
    })
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("closeNativeSidePanel")

    expect(await handler?.({ data: undefined, sender: {} })).toEqual({ closed: true })
    expect(close).toHaveBeenCalledWith({ windowId: 55 })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/background/__tests__/native-side-panel.test.ts
```

Expected: FAIL with an import error for `../native-side-panel`.

- [ ] **Step 3: Add message contracts**

In `apps/extension/src/utils/message.ts`, add these lines near the navigation messages:

```ts
  openNativeSidePanel: (data?: { windowId?: number }) => Promise<{ opened: boolean }>
  closeNativeSidePanel: () => Promise<{ closed: boolean }>
  getNativeSidePanelSupport: () => Promise<{ supported: boolean }>
```

- [ ] **Step 4: Create the background side-panel handlers**

Create `apps/extension/src/entrypoints/background/native-side-panel.ts`:

```ts
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
  return await getChromeWithSidePanel()?.windows?.getCurrent?.()
    .then(window => window.id)
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
```

- [ ] **Step 5: Register handlers in the background entrypoint**

In `apps/extension/src/entrypoints/background/index.ts`, add:

```ts
import { setupNativeSidePanelHandlers } from "./native-side-panel"
```

Then call it near the other synchronous setup calls:

```ts
    setupNativeSidePanelHandlers()
```

Place it before `setupSidebarOpenSync()` so side-panel message handlers are registered on service-worker startup.

- [ ] **Step 6: Run the background tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/background/__tests__/native-side-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/utils/message.ts apps/extension/src/entrypoints/background/native-side-panel.ts apps/extension/src/entrypoints/background/__tests__/native-side-panel.test.ts apps/extension/src/entrypoints/background/index.ts
git commit -m "feat(extension): wire native side panel background handlers"
```

---

### Task 4: Open Native Side Panel From The Floating Button

**Files:**
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`

- [ ] **Step 1: Add the failing floating-button tests**

In `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`, add these tests after the existing open-panel behavior tests:

```tsx
it("opens the native side panel instead of the content overlay when supported", async () => {
  sendMessageMock.mockImplementation(async (type: string) => {
    if (type === "openNativeSidePanel")
      return { opened: true }
    return undefined
  })
  renderFloatingButton({ clickAction: "openSidePanel" })

  fireEvent.click(screen.getByLabelText("translationWorkbench.openPanel"))

  await waitFor(() => {
    expect(sendMessageMock).toHaveBeenCalledWith("openNativeSidePanel", undefined)
  })
  expect(screen.getByTestId("side-open-state")).toHaveTextContent("false")
})

it("falls back to the content overlay when native side panel open is unavailable", async () => {
  sendMessageMock.mockImplementation(async (type: string) => {
    if (type === "openNativeSidePanel")
      return { opened: false }
    return undefined
  })
  renderFloatingButton({ clickAction: "openSidePanel" })

  fireEvent.click(screen.getByLabelText("translationWorkbench.openPanel"))

  await waitFor(() => {
    expect(screen.getByTestId("side-open-state")).toHaveTextContent("true")
  })
})
```

If this test file uses different helper names, keep its existing render helper and adapt only the asserted behavior:

```ts
expect(sendMessageMock).toHaveBeenCalledWith("openNativeSidePanel", undefined)
expect(store.get(isSideOpenAtom)).toBe(false)
expect(store.get(isSideOpenAtom)).toBe(true)
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
```

Expected: FAIL because the floating button does not call `openNativeSidePanel`.

- [ ] **Step 3: Add a helper in the floating button component**

In `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx`, add this helper inside `FloatingButton`, before `handleButtonDragStart`:

```tsx
  async function openSidebarSurface() {
    try {
      const result = await sendMessage("openNativeSidePanel", undefined)
      if (result.opened) {
        return
      }
    }
    catch (error) {
      swallowExtensionLifecycleError("floating-button open native side panel")(error)
    }

    void setIsSideOpen(true)
  }
```

- [ ] **Step 4: Use the helper for explicit open-panel clicks**

Replace the body of `handleOpenPanelClick` in `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx` with:

```tsx
  const handleOpenPanelClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    void openSidebarSurface()
  }
```

- [ ] **Step 5: Use the helper for floating-button sidebar click-action**

In `handleMouseUp`, replace:

```tsx
          void setIsSideOpen(o => !o)
```

with:

```tsx
          if (isSideOpen) {
            void setIsSideOpen(false)
          }
          else {
            void openSidebarSurface()
          }
```

This preserves the existing ability to close the injected overlay when the fallback overlay is already open.

- [ ] **Step 6: Run the floating-button tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
git commit -m "feat(extension): open native side panel from floating button"
```

---

### Task 5: Build, Inspect Manifest, And Manually Verify Chrome Behavior

**Files:**
- No source files expected beyond Tasks 1-4.

- [ ] **Step 1: Run focused tests**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx src/entrypoints/sidepanel/__tests__/app.test.tsx src/entrypoints/background/__tests__/native-side-panel.test.ts src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run:

```bash
pnpm --filter @getu/extension type-check
```

Expected: PASS.

- [ ] **Step 3: Build the extension**

Run:

```bash
pnpm --filter @getu/extension build
```

Expected: PASS.

- [ ] **Step 4: Inspect generated manifest for native side-panel support**

Run:

```bash
node -e "const m=require('./apps/extension/output/chrome-mv3/manifest.json'); console.log(JSON.stringify({side_panel:m.side_panel, permissions:m.permissions}, null, 2))"
```

Expected output includes:

```json
{
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "permissions": [
    "sidePanel"
  ]
}
```

The `permissions` array will include other existing permissions too; the required check is that `sidePanel` is present and `side_panel.default_path` points to the generated side-panel page.

- [ ] **Step 5: Manual Chrome verification**

Run:

```bash
pnpm --filter @getu/extension dev
```

Expected: WXT starts a Chrome dev build.

Then verify manually in Chrome:

1. Load/reload the dev extension from `apps/extension/output/chrome-mv3`.
2. Open `https://example.com`.
3. Click the GetU floating button's open-panel tab.
4. Expected: Chrome's native side panel opens with the GetU Translate sidebar UI.
5. Open another normal web tab in the same Chrome window.
6. Expected: The native side panel remains visible in the same window.
7. Open a `chrome://` page in the same window.
8. Expected: The native side panel remains visible because it is no longer tied to content-script injection.
9. Click the sidebar close button.
10. Expected: The native side panel closes on Chrome versions that support `chrome.sidePanel.close`; on older versions, the browser-level close button still closes it.

- [ ] **Step 6: Commit validation notes if docs are updated**

If manual verification reveals a Chrome version limitation for `chrome.sidePanel.close`, add a short note to this plan or the PR description rather than adding compatibility code outside the tested helper.

- [ ] **Step 7: Final commit if validation docs changed**

```bash
git add docs/superpowers/plans/2026-04-27-chrome-persistent-sidebar.md
git commit -m "docs(extension): plan native persistent sidebar"
```

---

## Self-Review

- Spec coverage: The plan addresses the reported tab-switch disappearance by moving Chrome/Edge to a global native side panel. It preserves the existing content-script overlay as fallback instead of deleting it.
- Placeholder scan: No task uses deferral markers or unspecified broad handling work. Each source-changing task includes concrete paths, code, commands, and expected results.
- Type consistency: Message names are `openNativeSidePanel`, `closeNativeSidePanel`, and `getNativeSidePanelSupport` throughout. The reusable prop names are `portalContainer` and `onClose` throughout.
