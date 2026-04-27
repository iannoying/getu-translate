# Sidebar Tab Persistence And TTS Voice Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two sidebar regressions: keep the sidebar open when switching Chrome tabs in the same window, and make translated-text speech use the translated target language voice instead of falling back to an incompatible default voice.

**Architecture:** Keep the existing content-script sidebar and persisted `isSideOpenAtom`, but add an explicit background-to-content sync path on tab activation/load completion so newly activated tabs reopen the sidebar when the persisted sidebar state is open. For TTS, pass the translation target language from `SidebarTextTab` into `TranslationWorkbenchResultCard`, then into `useTextToSpeech`, so Edge TTS voice selection can use the known target language and avoid unreliable short-text language detection.

**Tech Stack:** WXT MV3 extension, React 19, Jotai, @webext-core/messaging, Vitest/jsdom, pnpm.

---

## File Structure

- Modify `apps/extension/src/utils/constants/storage-keys.ts`
  - Move/export the sidebar open storage key here so both side content and background can use the same constant.
- Modify `apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts`
  - Import `SIDEBAR_OPEN_STORAGE_KEY` from shared constants instead of defining it locally.
- Modify `apps/extension/src/utils/message.ts`
  - Add the content-script message `setSidebarOpenOnContentScript`.
- Create `apps/extension/src/entrypoints/side.content/components/sidebar-open-message-bridge.tsx`
  - React bridge that listens for `setSidebarOpenOnContentScript` and writes `isSideOpenAtom`.
- Create `apps/extension/src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx`
  - Verifies the message opens/closes the Jotai atom and unregisters on unmount.
- Modify `apps/extension/src/entrypoints/side.content/app.tsx`
  - Mount the message bridge alongside `FloatingButton`, `SideContent`, and `FrogToast`.
- Create `apps/extension/src/entrypoints/background/sidebar-open-sync.ts`
  - Background listener that reads the persisted sidebar open key and notifies the active tab when Chrome switches tabs or a tab finishes loading.
- Create `apps/extension/src/entrypoints/background/__tests__/sidebar-open-sync.test.ts`
  - Unit tests for activation, update gating, closed-state no-op, and stale-tab message failures.
- Modify `apps/extension/src/entrypoints/background/index.ts`
  - Register `setupSidebarOpenSync()` during background startup.
- Modify `apps/extension/src/hooks/use-text-to-speech.tsx`
  - Add an optional `language` play option and make voice resolution prefer it before detection.
- Modify `apps/extension/src/hooks/__tests__/use-text-to-speech.test.ts`
  - Add a direct unit test for explicit language voice selection.
- Modify `apps/extension/src/components/translation-workbench/result-card.tsx`
  - Add optional `speechLanguage` prop and pass it to `play()`.
- Modify `apps/extension/src/components/translation-workbench/__tests__/result-card.test.tsx`
  - Verify result-card speech passes `speechLanguage` to TTS.
- Modify `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`
  - Pass `language.targetCode` to each translation result card.
- Modify `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx`
  - Extend the result-card mock to expose `speechLanguage` and verify it matches the configured target language.

---

### Task 1: Share The Sidebar Open Storage Key

**Files:**
- Modify: `apps/extension/src/utils/constants/storage-keys.ts`
- Modify: `apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts`
- Test: `apps/extension/src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts`

- [ ] **Step 1: Write the failing import-source test**

Update `apps/extension/src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts` to assert the exported key still matches the storage calls after the key is moved:

```ts
it("exports the shared sidebar open storage key", async () => {
  const { SIDEBAR_OPEN_STORAGE_KEY } = await import("../sidebar-open-state")

  expect(SIDEBAR_OPEN_STORAGE_KEY).toBe("local:getu:side-content:open")
})
```

- [ ] **Step 2: Run the test to verify the current behavior**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts
```

Expected: PASS. This is a characterization test that protects the key value before moving its source.

- [ ] **Step 3: Move the key to shared constants**

In `apps/extension/src/utils/constants/storage-keys.ts`, add:

```ts
export const SIDEBAR_OPEN_STORAGE_KEY = "local:getu:side-content:open" as const
```

In `apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts`, replace the local constant with an import and re-export:

```ts
import { storage } from "#imports"
import { atom } from "jotai"
import { swallowInvalidatedStorageRead } from "@/utils/extension-lifecycle"
import { SIDEBAR_OPEN_STORAGE_KEY } from "@/utils/constants/storage-keys"
import { logger } from "@/utils/logger"

export { SIDEBAR_OPEN_STORAGE_KEY }
```

Delete this local line from `sidebar-open-state.ts`:

```ts
export const SIDEBAR_OPEN_STORAGE_KEY = "local:getu:side-content:open" as const
```

- [ ] **Step 4: Run the sidebar-open-state test**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/utils/constants/storage-keys.ts apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts apps/extension/src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts
git commit -m "fix(extension): share sidebar open storage key"
```

---

### Task 2: Add A Content-Script Sidebar Open Message Bridge

**Files:**
- Modify: `apps/extension/src/utils/message.ts`
- Create: `apps/extension/src/entrypoints/side.content/components/sidebar-open-message-bridge.tsx`
- Create: `apps/extension/src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/app.tsx`

- [ ] **Step 1: Add the failing bridge test**

Create `apps/extension/src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider, useAtomValue } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { isSideOpenAtom } from "../../atoms"
import { SidebarOpenMessageBridge } from "../sidebar-open-message-bridge"

const messageHandlers = vi.hoisted(() => new Map<string, (message: { data: { open: boolean } }) => void>())
const unsubscribeMock = vi.hoisted(() => vi.fn())
const storageState = vi.hoisted(() => ({
  getItem: vi.fn(async () => false),
  setItem: vi.fn(async () => undefined),
  watch: vi.fn((_key: string, _cb: (value: boolean | null) => void) => vi.fn()),
}))

vi.mock("#imports", () => ({
  storage: storageState,
}))

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn((type: string, handler: (message: { data: { open: boolean } }) => void) => {
    messageHandlers.set(type, handler)
    return unsubscribeMock
  }),
}))

function SidebarOpenProbe() {
  const isOpen = useAtomValue(isSideOpenAtom)
  return <div data-testid="sidebar-open">{String(isOpen)}</div>
}

describe("SidebarOpenMessageBridge", () => {
  beforeEach(() => {
    messageHandlers.clear()
    unsubscribeMock.mockReset()
    storageState.getItem.mockReset().mockResolvedValue(false)
    storageState.setItem.mockReset().mockResolvedValue(undefined)
    storageState.watch.mockReset().mockImplementation((_key: string, _cb: (value: boolean | null) => void) => vi.fn())
  })

  it("updates the sidebar open atom from background messages", async () => {
    const store = createStore()
    render(
      <JotaiProvider store={store}>
        <SidebarOpenMessageBridge />
        <SidebarOpenProbe />
      </JotaiProvider>,
    )

    const handler = messageHandlers.get("setSidebarOpenOnContentScript")
    expect(handler).toBeDefined()

    handler?.({ data: { open: true } })
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-open")).toHaveTextContent("true")
    })

    handler?.({ data: { open: false } })
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-open")).toHaveTextContent("false")
    })
  })

  it("unregisters the background message listener on unmount", () => {
    const store = createStore()
    const rendered = render(
      <JotaiProvider store={store}>
        <SidebarOpenMessageBridge />
      </JotaiProvider>,
    )

    rendered.unmount()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the failing bridge test**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx
```

Expected: FAIL with an import error for `../sidebar-open-message-bridge`.

- [ ] **Step 3: Add the message type**

In `apps/extension/src/utils/message.ts`, add this line in `ProtocolMap` near the translation/side-content messages:

```ts
setSidebarOpenOnContentScript: (data: { open: boolean }) => void
```

- [ ] **Step 4: Implement the bridge**

Create `apps/extension/src/entrypoints/side.content/components/sidebar-open-message-bridge.tsx`:

```tsx
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
```

- [ ] **Step 5: Mount the bridge in the side content app**

Modify `apps/extension/src/entrypoints/side.content/app.tsx`:

```tsx
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
```

- [ ] **Step 6: Run the bridge test**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/utils/message.ts apps/extension/src/entrypoints/side.content/components/sidebar-open-message-bridge.tsx apps/extension/src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx apps/extension/src/entrypoints/side.content/app.tsx
git commit -m "fix(extension): listen for sidebar open sync messages"
```

---

### Task 3: Sync Sidebar Open State On Chrome Tab Activation

**Files:**
- Create: `apps/extension/src/entrypoints/background/sidebar-open-sync.ts`
- Create: `apps/extension/src/entrypoints/background/__tests__/sidebar-open-sync.test.ts`
- Modify: `apps/extension/src/entrypoints/background/index.ts`

- [ ] **Step 1: Add failing background sync tests**

Create `apps/extension/src/entrypoints/background/__tests__/sidebar-open-sync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const listeners = vi.hoisted(() => ({
  activated: [] as Array<(info: { tabId: number, windowId: number }) => void>,
  updated: [] as Array<(tabId: number, changeInfo: { status?: string }, tab: { active?: boolean }) => void>,
}))

const storageGetItemMock = vi.hoisted(() => vi.fn(async () => null as boolean | null))
const sendMessageMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("#imports", () => ({
  browser: {
    tabs: {
      onActivated: {
        addListener: vi.fn((listener: (info: { tabId: number, windowId: number }) => void) => {
          listeners.activated.push(listener)
        }),
      },
      onUpdated: {
        addListener: vi.fn((listener: (tabId: number, changeInfo: { status?: string }, tab: { active?: boolean }) => void) => {
          listeners.updated.push(listener)
        }),
      },
    },
  },
  storage: {
    getItem: storageGetItemMock,
  },
}))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

describe("sidebar open background sync", () => {
  beforeEach(() => {
    vi.resetModules()
    listeners.activated = []
    listeners.updated = []
    storageGetItemMock.mockReset().mockResolvedValue(null)
    sendMessageMock.mockReset().mockResolvedValue(undefined)
  })

  it("opens the activated tab when the persisted sidebar state is open", async () => {
    storageGetItemMock.mockResolvedValueOnce(true)
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.activated[0]?.({ tabId: 123, windowId: 7 })

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        "setSidebarOpenOnContentScript",
        { open: true },
        123,
      )
    })
  })

  it("does not message activated tabs when the persisted sidebar state is closed", async () => {
    storageGetItemMock.mockResolvedValueOnce(false)
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.activated[0]?.({ tabId: 123, windowId: 7 })

    await vi.waitFor(() => {
      expect(storageGetItemMock).toHaveBeenCalled()
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("retries sync when an active tab completes loading", async () => {
    storageGetItemMock.mockResolvedValueOnce(true)
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.updated[0]?.(456, { status: "complete" }, { active: true })

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        "setSidebarOpenOnContentScript",
        { open: true },
        456,
      )
    })
  })

  it("does not sync inactive or incomplete tab updates", async () => {
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.updated[0]?.(456, { status: "loading" }, { active: true })
    listeners.updated[0]?.(789, { status: "complete" }, { active: false })

    expect(storageGetItemMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("swallows content-script messaging failures for unsupported pages", async () => {
    storageGetItemMock.mockResolvedValueOnce(true)
    sendMessageMock.mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.activated[0]?.({ tabId: 123, windowId: 7 })

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1)
    })
  })
})
```

- [ ] **Step 2: Run the failing background sync tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/background/__tests__/sidebar-open-sync.test.ts
```

Expected: FAIL with an import error for `../sidebar-open-sync`.

- [ ] **Step 3: Implement the background sync module**

Create `apps/extension/src/entrypoints/background/sidebar-open-sync.ts`:

```ts
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
    .catch(swallowExtensionLifecycleError("sidebar open sync to active tab"))
}

export function setupSidebarOpenSync() {
  browser.tabs.onActivated.addListener((activeInfo) => {
    void syncSidebarOpenToTab(activeInfo.tabId)
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab.active) {
      return
    }

    void syncSidebarOpenToTab(tabId)
  })
}
```

- [ ] **Step 4: Register background sync at startup**

Modify `apps/extension/src/entrypoints/background/index.ts`.

Add the import:

```ts
import { setupSidebarOpenSync } from "./sidebar-open-sync"
```

Call it in `main()` after `translationMessage()` and before context menu registration:

```ts
translationMessage()
setupSidebarOpenSync()

// Register context menu listeners synchronously
registerContextMenuListeners()
```

- [ ] **Step 5: Run the background sync tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/background/__tests__/sidebar-open-sync.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the bridge and sidebar-open-state tests together**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/background/__tests__/sidebar-open-sync.test.ts src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/entrypoints/background/sidebar-open-sync.ts apps/extension/src/entrypoints/background/__tests__/sidebar-open-sync.test.ts apps/extension/src/entrypoints/background/index.ts
git commit -m "fix(extension): keep sidebar open across active tabs"
```

---

### Task 4: Make TTS Prefer Explicit Translation Target Language

**Files:**
- Modify: `apps/extension/src/hooks/use-text-to-speech.tsx`
- Modify: `apps/extension/src/hooks/__tests__/use-text-to-speech.test.ts`

- [ ] **Step 1: Add a failing voice-selection test**

Modify `apps/extension/src/hooks/__tests__/use-text-to-speech.test.ts` so `baseTtsConfig.languageVoices` includes Chinese, then add the explicit language test:

```ts
const baseTtsConfig = {
  defaultVoice: "en-US-DavisNeural",
  languageVoices: {
    eng: "en-US-DavisNeural",
    jpn: "ja-JP-KeitaNeural",
    cmn: "zh-CN-YunxiNeural",
  },
  rate: 0,
  pitch: 0,
  volume: 0,
} as TTSConfig

it("uses an explicit translation target language before defaulting", () => {
  expect(selectTTSVoice(baseTtsConfig, "cmn")).toBe("zh-CN-YunxiNeural")
})
```

- [ ] **Step 2: Run the current TTS hook tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/hooks/__tests__/use-text-to-speech.test.ts
```

Expected: PASS. This characterizes the voice selector before wiring the explicit language through `play()`.

- [ ] **Step 3: Add the explicit language play option**

Modify `apps/extension/src/hooks/use-text-to-speech.tsx`.

Add the type import:

```ts
import type { LangCodeISO6393 } from "@getu/definitions"
```

Update `PlayAudioParams`:

```ts
interface PlayAudioParams {
  text: string
  ttsConfig: TTSConfig
  analyticsContext: FeatureUsageContext
  forcedVoice?: string
  language?: LangCodeISO6393
}
```

Update `resolveVoiceForText`:

```ts
async function resolveVoiceForText(
  text: string,
  ttsConfig: TTSConfig,
  enableLLM: boolean,
  forcedVoice?: string,
  language?: LangCodeISO6393,
): Promise<string> {
  if (forcedVoice) {
    logger.info("[TextToSpeech] Using forced voice for text", {
      text,
      forcedVoice,
    })
    return forcedVoice
  }

  if (language) {
    logger.info("[TextToSpeech] Using explicit language for text", {
      text,
      language,
    })
    return selectTTSVoice(ttsConfig, language)
  }

  const detectedLanguage = await detectLanguage(text, {
    minLength: 0,
    enableLLM,
  })
  logger.info("[TextToSpeech] Resolving voice for text", {
    text,
    detectedLanguage,
    enableLLM,
  })

  return selectTTSVoice(ttsConfig, detectedLanguage)
}
```

Update the mutation signature:

```ts
mutationFn: async ({ text, ttsConfig, analyticsContext, forcedVoice, language }) => {
```

Update the selected voice line:

```ts
const selectedVoice = await resolveVoiceForText(text, ttsConfig, languageDetection.mode === "llm", forcedVoice, language)
```

Update `play`:

```ts
const play = (text: string, ttsConfig: TTSConfig, options?: { forcedVoice?: string, language?: LangCodeISO6393 }) => {
  return playMutation.mutateAsync({
    text,
    ttsConfig,
    forcedVoice: options?.forcedVoice,
    language: options?.language,
    analyticsContext: createFeatureUsageContext(
      ANALYTICS_FEATURE.TEXT_TO_SPEECH,
      surface,
    ),
  })
}
```

- [ ] **Step 4: Run TTS hook tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/hooks/__tests__/use-text-to-speech.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/hooks/use-text-to-speech.tsx apps/extension/src/hooks/__tests__/use-text-to-speech.test.ts
git commit -m "fix(extension): allow explicit TTS target language"
```

---

### Task 5: Pass Target Language From Sidebar Result Cards To TTS

**Files:**
- Modify: `apps/extension/src/components/translation-workbench/result-card.tsx`
- Modify: `apps/extension/src/components/translation-workbench/__tests__/result-card.test.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx`

- [ ] **Step 1: Add failing result-card TTS option test**

Modify `apps/extension/src/components/translation-workbench/__tests__/result-card.test.tsx` by adding this test:

```tsx
it("passes the target language to TTS when provided", async () => {
  render(
    <TranslationWorkbenchResultCard
      provider={provider}
      result={{ providerId: provider.id, status: "success", text: "你好" }}
      speechLanguage="cmn"
      onRetry={vi.fn()}
      onLogin={vi.fn()}
      onUpgrade={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByLabelText("action.speak"))

  await waitFor(() => {
    expect(ttsPlayMock).toHaveBeenCalledWith("你好", ttsConfigMock, { language: "cmn" })
  })
})
```

- [ ] **Step 2: Run the failing result-card test**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/components/translation-workbench/__tests__/result-card.test.tsx
```

Expected: FAIL with a TypeScript/runtime test failure because `speechLanguage` is not a known prop and `play()` is still called without the language option.

- [ ] **Step 3: Implement `speechLanguage` in result-card**

Modify `apps/extension/src/components/translation-workbench/result-card.tsx`.

Add the type import:

```ts
import type { LangCodeISO6393 } from "@getu/definitions"
```

Update props:

```ts
interface TranslationWorkbenchResultCardProps {
  provider: TranslateProviderConfig
  result: TranslationResultState
  speechLanguage?: LangCodeISO6393
  onRetry: (providerId: string) => void
  onLogin: () => void
  onUpgrade: () => void
}
```

Destructure the prop:

```ts
export function TranslationWorkbenchResultCard({
  provider,
  result,
  speechLanguage,
  onRetry,
  onLogin,
  onUpgrade,
}: TranslationWorkbenchResultCardProps) {
```

Update `toggleSpeech()`:

```ts
function toggleSpeech() {
  if (isSpeakingBusy) {
    stop()
    return
  }
  if (!result.text)
    return
  void play(result.text, ttsConfig, speechLanguage ? { language: speechLanguage } : undefined)
}
```

- [ ] **Step 4: Run result-card tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/components/translation-workbench/__tests__/result-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add failing sidebar propagation test**

Modify the mock in `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx`:

```tsx
vi.mock("@/components/translation-workbench/result-card", () => ({
  TranslationWorkbenchResultCard: ({
    provider,
    speechLanguage,
    onLogin,
    onUpgrade,
  }: {
    provider: { name: string }
    speechLanguage?: string
    onLogin: () => void
    onUpgrade: () => void
  }) => (
    <div data-testid="translation-result-card" data-speech-language={speechLanguage}>
      <span>{provider.name}</span>
      <button type="button" onClick={onLogin}>login</button>
      <button type="button" onClick={onUpgrade}>upgrade</button>
    </div>
  ),
}))
```

Add this test:

```tsx
it("passes the target language to translation result speech controls", () => {
  providersConfigMock.mockReturnValue([
    {
      id: "getu-pro-gemini-3-flash-preview",
      name: "Gemini-3-flash",
      provider: "getu-pro",
      enabled: true,
      apiKey: "test",
      model: { model: "gemini-3-flash-preview", isCustomModel: false, customModel: null },
    },
  ])

  renderSidebarTextTab()

  expect(screen.getByTestId("translation-result-card")).toHaveAttribute("data-speech-language", "cmn")
})
```

- [ ] **Step 6: Run the failing sidebar propagation test**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
```

Expected: FAIL because `SidebarTextTab` does not pass `speechLanguage` yet.

- [ ] **Step 7: Pass `language.targetCode` to result cards**

Modify `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx`:

```tsx
<TranslationWorkbenchResultCard
  key={provider.id}
  provider={provider}
  result={results[provider.id] ?? { providerId: provider.id, status: "idle" }}
  speechLanguage={language.targetCode}
  onRetry={providerId => void translate([providerId])}
  onLogin={login}
  onUpgrade={upgrade}
/>
```

- [ ] **Step 8: Run result-card and sidebar tests together**

Run:

```bash
pnpm --filter @getu/extension exec vitest run src/components/translation-workbench/__tests__/result-card.test.tsx src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/extension/src/components/translation-workbench/result-card.tsx apps/extension/src/components/translation-workbench/__tests__/result-card.test.tsx apps/extension/src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
git commit -m "fix(extension): read sidebar translations with target language voice"
```

---

### Task 6: Final Verification And Package Export

**Files:**
- No source files created in this task.

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
pnpm --filter @getu/extension exec vitest run \
  src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts \
  src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx \
  src/entrypoints/background/__tests__/sidebar-open-sync.test.ts \
  src/hooks/__tests__/use-text-to-speech.test.ts \
  src/components/translation-workbench/__tests__/result-card.test.tsx \
  src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run lint on changed files**

Run:

```bash
pnpm --filter @getu/extension lint -- \
  src/utils/constants/storage-keys.ts \
  src/utils/message.ts \
  src/entrypoints/side.content/utils/sidebar-open-state.ts \
  src/entrypoints/side.content/components/sidebar-open-message-bridge.tsx \
  src/entrypoints/side.content/components/__tests__/sidebar-open-message-bridge.test.tsx \
  src/entrypoints/side.content/app.tsx \
  src/entrypoints/background/sidebar-open-sync.ts \
  src/entrypoints/background/__tests__/sidebar-open-sync.test.ts \
  src/entrypoints/background/index.ts \
  src/hooks/use-text-to-speech.tsx \
  src/hooks/__tests__/use-text-to-speech.test.ts \
  src/components/translation-workbench/result-card.tsx \
  src/components/translation-workbench/__tests__/result-card.test.tsx \
  src/entrypoints/side.content/components/side-content/sidebar-text-tab.tsx \
  src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run extension type-check**

Run:

```bash
pnpm --filter @getu/extension type-check
```

Expected: PASS.

- [ ] **Step 4: Build/export the Chrome extension package**

Run:

```bash
pnpm --filter @getu/extension zip
```

Expected: PASS. The known optional secret warnings for `WXT_GOOGLE_CLIENT_ID`, `WXT_POSTHOG_API_KEY`, and `WXT_POSTHOG_HOST` are acceptable when `WXT_REQUIRE_SECRETS` is not true.

- [ ] **Step 5: Report package paths**

Report:

```text
Unpacked folder:
/Users/andy.peng/.codex/worktrees/6433/getu-translate/apps/extension/output/chrome-mv3

Zip package:
/Users/andy.peng/.codex/worktrees/6433/getu-translate/apps/extension/output/getuextension-1.33.1-chrome.zip
```

---

## Manual Browser Verification

- [ ] Load `/Users/andy.peng/.codex/worktrees/6433/getu-translate/apps/extension/output/chrome-mv3` in Chrome extension developer mode.
- [ ] Open a normal `https://` page, open the GetU sidebar, then click another normal `https://` tab in the same Chrome window.
- [ ] Confirm the sidebar opens on the newly active tab without clicking the extension again.
- [ ] Click the sidebar close button, switch tabs again, and confirm the sidebar stays closed.
- [ ] In the sidebar, translate `hello` to Simplified Chinese.
- [ ] Click the speaker icon under the Chinese translation.
- [ ] Confirm it plays with a Chinese Edge TTS voice and does not show `The current voice may not support this language. Try switching to a matching voice.`

Note: content scripts cannot render on Chrome-restricted pages such as `chrome://*`, the Chrome Web Store, or some extension pages. The tab-switch persistence requirement applies to normal pages where the extension content script can run.

---

## Self-Review

**Spec coverage:**
- Bug 1, sidebar disappears when switching Chrome tabs in the same window: covered by Tasks 1-3 and the manual browser verification.
- Bug 2, translated-text speaker errors with voice/language mismatch: covered by Tasks 4-5 and the manual browser verification.

**Placeholder scan:**
- The plan contains no banned placeholder markers or unfilled implementation steps.
- Every code-changing step includes concrete file paths, code blocks, commands, and expected outcomes.

**Type consistency:**
- `setSidebarOpenOnContentScript` is added to `ProtocolMap` and used by both background and content bridge with `{ open: boolean }`.
- `speechLanguage` is typed as `LangCodeISO6393` and flows from `language.targetCode` to result-card to `useTextToSpeech(..., { language })`.
- `SIDEBAR_OPEN_STORAGE_KEY` remains the same string value while moving from side-content-only utility to shared constants.
