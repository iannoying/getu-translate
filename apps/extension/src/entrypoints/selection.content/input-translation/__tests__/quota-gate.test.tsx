// @vitest-environment jsdom
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useInputTranslation } from "../use-input-translation"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const checkAndIncrementMock = vi.fn<() => Promise<boolean>>()
const quotaStateRef: { current: { isLoading: boolean, used: number, limit: number | "unlimited", canTranslate: boolean } } = {
  current: { isLoading: false, used: 0, limit: 50, canTranslate: true },
}

vi.mock("../quota/use-input-quota", () => ({
  useInputTranslationQuota: () => ({
    ...quotaStateRef.current,
    checkAndIncrement: checkAndIncrementMock,
  }),
  FREE_INPUT_TRANSLATION_DAILY_LIMIT: 50,
}))

const guardMock = vi.fn<(feature: string, opts?: { source?: string }) => boolean>()
vi.mock("@/hooks/use-pro-guard", () => ({
  useProGuard: () => ({
    isLoading: false,
    guard: guardMock,
    dialogProps: { open: false, onOpenChange: vi.fn(), source: undefined },
  }),
}))

const translateTextForInputMock = vi.fn<(text: string, from: string, to: string) => Promise<string>>()
vi.mock("@/utils/host/translate/translate-variants", () => ({
  translateTextForInput: (text: string, from: string, to: string) => translateTextForInputMock(text, from, to),
}))

vi.mock("@/utils/analytics", () => ({
  trackFeatureAttempt: async (_ctx: unknown, fn: () => Promise<string>) => fn(),
  createFeatureUsageContext: () => ({}),
}))

const inputTranslationConfig = {
  enabled: true,
  providerId: "google",
  fromLang: "eng",
  toLang: "cmn",
  enableCycle: false,
  timeThreshold: 300,
}
vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    inputTranslation: { toString: () => "atom:inputTranslation" },
  },
}))
vi.mock("jotai", async () => {
  const actual = await vi.importActual<typeof import("jotai")>("jotai")
  return {
    ...actual,
    useAtom: () => [inputTranslationConfig, vi.fn()],
  }
})

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function renderWithProviders<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const store = createStore()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  )
  return renderHook(hook, { wrapper })
}

async function triggerTripleSpace(activeEl: HTMLElement) {
  activeEl.focus()
  for (let i = 0; i < 3; i++) {
    const ev = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
    document.dispatchEvent(ev)
    await new Promise(r => setTimeout(r, 10))
  }
}

beforeEach(() => {
  checkAndIncrementMock.mockReset()
  guardMock.mockReset()
  translateTextForInputMock.mockReset()
  translateTextForInputMock.mockResolvedValue("你好")
  document.body.innerHTML = ""
  quotaStateRef.current = { isLoading: false, used: 0, limit: 50, canTranslate: true }
  // jsdom doesn't ship document.execCommand — the real hook uses it to
  // preserve native Ctrl+Z undo. We stub it as a no-op so the gate logic
  // under test doesn't throw.
  ;(document as unknown as { execCommand: (...args: unknown[]) => boolean }).execCommand = () => true
  // jsdom doesn't ship Element.animate. The hook uses it for the loading
  // spinner — stub with a no-op that satisfies the `Animation`-ish shape
  // we touch (we never inspect it).
  ;(HTMLElement.prototype as unknown as { animate: (...args: unknown[]) => unknown }).animate = () => ({})
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useInputTranslation quota gate", () => {
  it("skips translation when quota.isLoading is true", async () => {
    quotaStateRef.current = { isLoading: true, used: 0, limit: 50, canTranslate: false }

    const textarea = document.createElement("textarea")
    textarea.value = "hello"
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await triggerTripleSpace(textarea)
    })

    expect(checkAndIncrementMock).not.toHaveBeenCalled()
    expect(translateTextForInputMock).not.toHaveBeenCalled()
    expect(guardMock).not.toHaveBeenCalled()
  })

  it("opens upgrade dialog when checkAndIncrement returns false (free cap hit)", async () => {
    checkAndIncrementMock.mockResolvedValue(false)

    const textarea = document.createElement("textarea")
    textarea.value = "hello"
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await triggerTripleSpace(textarea)
    })

    expect(checkAndIncrementMock).toHaveBeenCalledTimes(1)
    expect(translateTextForInputMock).not.toHaveBeenCalled()
    expect(guardMock).toHaveBeenCalledWith("input_translate_unlimited", {
      source: "input-translation-daily-limit",
    })
  })

  it("proceeds to translation when quota is available", async () => {
    checkAndIncrementMock.mockResolvedValue(true)

    const textarea = document.createElement("textarea")
    textarea.value = "hello"
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await triggerTripleSpace(textarea)
      // Give the async translation promise a tick to settle.
      await new Promise(r => setTimeout(r, 20))
    })

    expect(checkAndIncrementMock).toHaveBeenCalledTimes(1)
    expect(translateTextForInputMock).toHaveBeenCalledTimes(1)
    expect(guardMock).not.toHaveBeenCalled()
  })
})
