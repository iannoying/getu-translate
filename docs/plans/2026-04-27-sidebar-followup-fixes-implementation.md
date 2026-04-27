# Sidebar Follow-up Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the PR #212 sidebar follow-ups: model multi-select, cross-tab persistence, language selectors, provider logos, and locale-aware sidebar copy.

**Architecture:** Keep the sidebar in `apps/extension/src/entrypoints/side.content`. Persist the open/closed state through WXT local storage so every supported tab hydrates and watches the same explicit user choice. Replace fragile sidebar-specific picker behavior with Shadow DOM-contained popovers, and centralize provider-logo resolution for all sidebar workbench surfaces.

**Tech Stack:** WXT content scripts, React 19, Jotai, WXT `storage`, Base UI Popover/Select, Vitest, Testing Library, existing `@/utils/i18n` locale hydration.

---

## Reference Documents

- Approved design: `docs/specs/2026-04-27-sidebar-followup-fixes-design.md`
- Original sidebar design: `docs/specs/2026-04-26-extension-sidebar-design.md`
- Original sidebar plan: `docs/plans/2026-04-26-extension-sidebar-implementation.md`
- Side content notes: `apps/extension/src/entrypoints/side.content/AGENTS.md`
- Component notes: `apps/extension/src/entrypoints/side.content/components/AGENTS.md`
- Locale notes: `apps/extension/src/locales/AGENTS.md`

## File Map

- Create: `apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts`  
  Owns persisted sidebar open state storage key, hydration, watch, and writable Jotai atom.
- Create: `apps/extension/src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts`  
  Covers storage read, write, rollback, and cross-tab watch sync.
- Modify: `apps/extension/src/entrypoints/side.content/atoms.ts`  
  Re-export persisted `isSideOpenAtom` instead of a local `atom(false)`.
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`  
  Stop mocking `isSideOpenAtom` when testing persisted open behavior, or update the mock to match the new writable atom contract.
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`  
  Assert close writes through the persisted atom.
- Create: `apps/extension/src/components/translation-workbench/provider-logo.tsx`  
  Central provider logo resolver and fallback renderer.
- Create: `apps/extension/src/components/translation-workbench/__tests__/provider-logo.test.tsx`  
  Verifies catalog logos and fallback initials.
- Modify: `apps/extension/src/components/translation-workbench/provider-icon-stack.tsx`  
  Use shared provider logo renderer.
- Modify: `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`  
  Replace fragile multi-select `Select` with an explicit Popover checklist.
- Modify: `apps/extension/src/components/translation-workbench/result-card.tsx`  
  Use shared provider logo renderer.
- Create: `apps/extension/src/components/translation-workbench/__tests__/provider-multi-select.test.tsx`  
  Covers opening the popover and selecting multiple providers.
- Modify: `apps/extension/src/components/translation-workbench/language-picker.tsx`  
  Harden portal/z-index, trigger widths, and event reliability.
- Modify: `apps/extension/src/components/translation-workbench/__tests__/language-picker.test.tsx`  
  Cover source selector, target selector, and swap.
- Modify: `apps/extension/src/entrypoints/side.content/index.tsx`  
  Keep existing locale hydration; only change if tests prove scoped store hydration is missing.
- Create: `apps/extension/src/entrypoints/side.content/__tests__/i18n-hydration.test.tsx`  
  Verifies `side.content` can render zh-CN copy when the hydrated UI locale is zh-CN.

---

## Task 1: Persist Sidebar Open State Across Tabs

**Files:**
- Create: `apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts`
- Create: `apps/extension/src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts`
- Modify: `apps/extension/src/entrypoints/side.content/atoms.ts`

- [ ] **Step 1: Write the failing open-state atom tests**

Create `apps/extension/src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts`:

```ts
import { createStore } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"

const storageState = vi.hoisted(() => ({
  value: null as boolean | null,
  watchers: [] as ((value: boolean | null) => void)[],
  getItem: vi.fn(async () => null as boolean | null),
  setItem: vi.fn(async (_key: string, value: boolean) => {
    storageState.value = value
  }),
  watch: vi.fn((_key: string, cb: (value: boolean | null) => void) => {
    storageState.watchers.push(cb)
    return () => {
      storageState.watchers = storageState.watchers.filter(watcher => watcher !== cb)
    }
  }),
}))

vi.mock("#imports", () => ({
  storage: {
    getItem: storageState.getItem,
    setItem: storageState.setItem,
    watch: storageState.watch,
  },
}))

describe("sidebar persisted open state", () => {
  beforeEach(() => {
    vi.resetModules()
    storageState.value = null
    storageState.watchers = []
    storageState.getItem.mockReset().mockResolvedValue(null)
    storageState.setItem.mockReset().mockImplementation(async (_key: string, value: boolean) => {
      storageState.value = value
    })
    storageState.watch.mockReset().mockImplementation((_key: string, cb: (value: boolean | null) => void) => {
      storageState.watchers.push(cb)
      return () => {
        storageState.watchers = storageState.watchers.filter(watcher => watcher !== cb)
      }
    })
  })

  it("hydrates false when storage is empty", async () => {
    const { isSideOpenAtom, SIDEBAR_OPEN_STORAGE_KEY } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await Promise.resolve()
    await Promise.resolve()

    expect(storageState.getItem).toHaveBeenCalledWith(SIDEBAR_OPEN_STORAGE_KEY)
    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })

  it("hydrates true from local storage", async () => {
    storageState.getItem.mockResolvedValueOnce(true)
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await Promise.resolve()
    await Promise.resolve()

    expect(store.get(isSideOpenAtom)).toBe(true)

    unsubscribe()
  })

  it("persists open and close writes", async () => {
    const { isSideOpenAtom, SIDEBAR_OPEN_STORAGE_KEY } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await store.set(isSideOpenAtom, true)
    await store.set(isSideOpenAtom, false)

    expect(storageState.setItem).toHaveBeenNthCalledWith(1, SIDEBAR_OPEN_STORAGE_KEY, true)
    expect(storageState.setItem).toHaveBeenNthCalledWith(2, SIDEBAR_OPEN_STORAGE_KEY, false)
    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })

  it("supports functional updates used by the floating button", async () => {
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await store.set(isSideOpenAtom, open => !open)

    expect(store.get(isSideOpenAtom)).toBe(true)
    expect(storageState.setItem).toHaveBeenCalledWith(expect.any(String), true)

    unsubscribe()
  })

  it("syncs storage watch changes from another tab", async () => {
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    storageState.watchers.forEach(watcher => watcher(true))
    expect(store.get(isSideOpenAtom)).toBe(true)

    storageState.watchers.forEach(watcher => watcher(false))
    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })

  it("rolls back optimistic state when persisting fails", async () => {
    const error = new Error("storage unavailable")
    storageState.setItem.mockRejectedValueOnce(error)
    const { isSideOpenAtom } = await import("../sidebar-open-state")
    const store = createStore()
    const unsubscribe = store.sub(isSideOpenAtom, () => {})

    await store.set(isSideOpenAtom, true)

    expect(store.get(isSideOpenAtom)).toBe(false)

    unsubscribe()
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @getu/extension test -- src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts
```

Expected: fails because `sidebar-open-state.ts` does not exist.

- [ ] **Step 3: Implement the persisted atom**

Create `apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts`:

```ts
import { storage } from "#imports"
import { atom } from "jotai"
import { swallowInvalidatedStorageRead } from "@/utils/extension-lifecycle"
import { logger } from "@/utils/logger"

export const SIDEBAR_OPEN_STORAGE_KEY = "local:getu:side-content:open" as const

type SidebarOpenUpdate = boolean | ((current: boolean) => boolean)

const baseSideOpenAtom = atom(false)

function resolveSidebarOpenUpdate(update: SidebarOpenUpdate, current: boolean): boolean {
  return typeof update === "function" ? update(current) : update
}

export const isSideOpenAtom = atom(
  get => get(baseSideOpenAtom),
  async (get, set, update: SidebarOpenUpdate) => {
    const previous = get(baseSideOpenAtom)
    const next = resolveSidebarOpenUpdate(update, previous)

    set(baseSideOpenAtom, next)

    try {
      await storage.setItem(SIDEBAR_OPEN_STORAGE_KEY, next)
    }
    catch (error) {
      logger.error("Failed to persist sidebar open state", { next, error })
      set(baseSideOpenAtom, previous)
    }
  },
)

baseSideOpenAtom.onMount = (setAtom) => {
  void storage.getItem<boolean>(SIDEBAR_OPEN_STORAGE_KEY)
    .then(value => setAtom(value === true))
    .catch(swallowInvalidatedStorageRead("sidebar open state initial"))

  return storage.watch<boolean>(SIDEBAR_OPEN_STORAGE_KEY, (value) => {
    setAtom(value === true)
  })
}
```

- [ ] **Step 4: Re-export the persisted atom from side.content atoms**

Modify `apps/extension/src/entrypoints/side.content/atoms.ts` so it becomes:

```ts
import { atom, createStore } from "jotai"
import { createTranslationStateAtomForContentScript } from "@/utils/atoms/translation-state"
export { isSideOpenAtom } from "./utils/sidebar-open-state"

export const store = createStore()

export const isDraggingButtonAtom = atom(false)

export const enablePageTranslationAtom = createTranslationStateAtomForContentScript(
  { enabled: false },
)
```

- [ ] **Step 5: Run the open-state atom test**

Run:

```bash
pnpm --filter @getu/extension test -- src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/extension/src/entrypoints/side.content/atoms.ts apps/extension/src/entrypoints/side.content/utils/sidebar-open-state.ts apps/extension/src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts
git commit -m "fix(extension): persist sidebar open state"
```

---

## Task 2: Wire Persisted Open State Through Sidebar UI

**Files:**
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx` only when the test run exposes a functional-update type mismatch.
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx` only when the test run exposes an async setter mismatch.

- [ ] **Step 1: Update the close test to await the persisted write**

In `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx`, change the close test to:

```tsx
  it("closes the sidebar", async () => {
    const { store } = renderWithStore(<SidebarShell />)

    fireEvent.click(screen.getByLabelText("translationWorkbench.closeSidebar"))

    await vi.waitFor(() => {
      expect(store.get(isSideOpenAtom)).toBe(false)
    })
  })
```

Keep the existing imports; add `vi` if it is not imported in the file.

- [ ] **Step 2: Add a floating-button persistence assertion**

In `apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx`, add a test under `describe("floatingButton open panel tab", ...)`:

```tsx
  it("uses the shared sidebar open atom when opening from the tab", async () => {
    const { store } = renderWithStore(
      <>
        <FloatingButton />
        <SideOpenProbe />
      </>,
      { isSideOpen: false },
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.openPanel" }))

    await vi.waitFor(() => {
      expect(store.get(isSideOpenAtom)).toBe(true)
      expect(screen.getByTestId("side-open-state")).toHaveTextContent("true")
    })
  })
```

If this test still mocks `../../../atoms`, keep the mock for this file but ensure its `isSideOpenAtom` accepts functional updates. The preferred path is to use the real atom and mock `#imports.storage`, but do not expand the task if the existing test file is intentionally isolated.

- [ ] **Step 3: Run the sidebar UI tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
```

Expected: tests either pass or fail only where a synchronous assertion needs to wait for the async persisted atom write.

- [ ] **Step 4: Make minimal component changes only if tests fail**

If a component uses `setIsSideOpen(false)` or `setIsSideOpen(true)`, it already works with the new atom. If a test exposes a type error for functional updates, keep this usage in `apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx`:

```tsx
setIsSideOpen(o => !o)
```

and keep this usage in `apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx`:

```tsx
onClick={() => setIsSideOpen(false)}
```

Do not replace these with direct storage calls; persistence belongs in the atom.

- [ ] **Step 5: Re-run the sidebar UI tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx
```

Expected: all listed tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/extension/src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx apps/extension/src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx apps/extension/src/entrypoints/side.content/components/floating-button/index.tsx apps/extension/src/entrypoints/side.content/components/side-content/sidebar-shell.tsx
git commit -m "test(extension): cover persisted sidebar controls"
```

---

## Task 3: Centralize Provider Logo Rendering

**Files:**
- Create: `apps/extension/src/components/translation-workbench/provider-logo.tsx`
- Create: `apps/extension/src/components/translation-workbench/__tests__/provider-logo.test.tsx`
- Modify: `apps/extension/src/components/translation-workbench/provider-icon-stack.tsx`
- Modify: `apps/extension/src/components/translation-workbench/result-card.tsx`
- Modify: `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`

- [ ] **Step 1: Write the provider logo tests**

Create `apps/extension/src/components/translation-workbench/__tests__/provider-logo.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      getURL: (path = "") => `chrome-extension://test${path}`,
    },
  },
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    deepseek: {
      logo: () => "/assets/providers/deepseek-light.svg",
      name: "DeepSeek",
      website: "https://deepseek.com",
    },
  },
}))

const deepseekProvider: TranslateProviderConfig = {
  id: "deepseek-v4-pro",
  name: "DeepSeek-V4-Pro",
  provider: "deepseek",
  enabled: true,
  apiKey: "key",
  model: { model: "deepseek-chat", isCustomModel: false, customModel: null },
}

const unknownProvider = {
  ...deepseekProvider,
  id: "unknown-provider",
  name: "Mystery Model",
  provider: "missing-provider",
} as unknown as TranslateProviderConfig

describe("WorkbenchProviderLogo", () => {
  it("renders the provider catalog logo when available", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    render(<WorkbenchProviderLogo provider={deepseekProvider} />)

    expect(screen.getByRole("img", { name: "DeepSeek-V4-Pro" })).toHaveAttribute(
      "src",
      "chrome-extension://test/assets/providers/deepseek-light.svg",
    )
  })

  it("falls back to provider initials when no catalog logo exists", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    render(<WorkbenchProviderLogo provider={unknownProvider} />)

    expect(screen.getByLabelText("Mystery Model")).toHaveTextContent("M")
  })
})
```

- [ ] **Step 2: Run the failing provider logo test**

Run:

```bash
pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/provider-logo.test.tsx
```

Expected: fails because `provider-logo.tsx` does not exist.

- [ ] **Step 3: Implement the shared logo resolver**

Create `apps/extension/src/components/translation-workbench/provider-logo.tsx`:

```tsx
import type { TranslateProviderConfig } from "@/types/config/provider"
import type { AllProviderTypes } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { cn } from "@/utils/styles/utils"

interface WorkbenchProviderLogoProps {
  provider: TranslateProviderConfig
  theme?: string
  size?: "sm" | "base" | "md"
  className?: string
  textClassName?: string
  iconOnly?: boolean
}

export function resolveWorkbenchProviderLogo(
  provider: TranslateProviderConfig,
  theme: string,
): string | undefined {
  const item = PROVIDER_ITEMS[provider.provider as AllProviderTypes]
  if (!item)
    return undefined

  try {
    return item.logo(theme as never)
  }
  catch {
    return undefined
  }
}

export function getWorkbenchProviderInitial(provider: TranslateProviderConfig): string {
  return provider.name.trim().charAt(0).toUpperCase() || "?"
}

export function WorkbenchProviderLogo({
  provider,
  theme = "light",
  size = "sm",
  className,
  textClassName,
  iconOnly = false,
}: WorkbenchProviderLogoProps) {
  const logo = resolveWorkbenchProviderLogo(provider, theme)

  if (logo) {
    return (
      <ProviderIcon
        logo={logo}
        name={provider.name}
        size={size}
        className={className}
        textClassName={iconOnly ? "sr-only" : textClassName}
      />
    )
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span
        className="bg-muted text-muted-foreground grid size-5 shrink-0 place-items-center rounded-full border border-border text-[10px] font-semibold"
        aria-label={provider.name}
        title={provider.name}
      >
        {getWorkbenchProviderInitial(provider)}
      </span>
      {!iconOnly && (
        <span className={cn("truncate text-sm", textClassName)}>
          {provider.name}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Update the stack to use the resolver**

In `apps/extension/src/components/translation-workbench/provider-icon-stack.tsx`, remove local `ProviderIcon`, `PROVIDER_ITEMS`, `providerInitial`, and `resolveProviderLogo` helpers. Import:

```tsx
import { WorkbenchProviderLogo } from "./provider-logo"
```

Then replace the inner icon render with:

```tsx
<WorkbenchProviderLogo provider={provider} theme={theme} size="sm" iconOnly />
```

- [ ] **Step 5: Update result cards and provider picker rows**

In `apps/extension/src/components/translation-workbench/result-card.tsx`, remove local provider logo helpers and import:

```tsx
import { WorkbenchProviderLogo } from "./provider-logo"
```

Then replace `<ProviderHeaderIcon provider={provider} theme={theme} />` with:

```tsx
<WorkbenchProviderLogo provider={provider} theme={theme} size="sm" />
```

In `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`, remove local provider logo helpers and render row icons with:

```tsx
<WorkbenchProviderLogo provider={provider} theme={theme} size="sm" />
```

- [ ] **Step 6: Run provider logo and result-card tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/provider-logo.test.tsx src/components/translation-workbench/__tests__/result-card.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/extension/src/components/translation-workbench/provider-logo.tsx apps/extension/src/components/translation-workbench/__tests__/provider-logo.test.tsx apps/extension/src/components/translation-workbench/provider-icon-stack.tsx apps/extension/src/components/translation-workbench/provider-multi-select.tsx apps/extension/src/components/translation-workbench/result-card.tsx
git commit -m "fix(extension): share sidebar provider logos"
```

---

## Task 4: Replace Provider Selector With a Shadow-DOM Popover Checklist

**Files:**
- Modify: `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`
- Create: `apps/extension/src/components/translation-workbench/__tests__/provider-multi-select.test.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx`

- [ ] **Step 1: Write the provider multi-select tests**

Create `apps/extension/src/components/translation-workbench/__tests__/provider-multi-select.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ProviderMultiSelect } from "../provider-multi-select"

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      getURL: (path = "") => `chrome-extension://test${path}`,
    },
  },
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    deepseek: { logo: () => "/deepseek.svg", name: "DeepSeek", website: "" },
    alibaba: { logo: () => "/alibaba.svg", name: "Alibaba", website: "" },
    "google-translate": { logo: () => "/google.svg", name: "Google Translate", website: "" },
  },
}))

const providers: TranslateProviderConfig[] = [
  {
    id: "google",
    name: "Google Translate",
    provider: "google-translate",
    enabled: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek-V4-Pro",
    provider: "deepseek",
    enabled: true,
    apiKey: "key",
    model: { model: "deepseek-chat", isCustomModel: false, customModel: null },
  },
  {
    id: "qwen",
    name: "Qwen3.5-plus",
    provider: "alibaba",
    enabled: true,
    apiKey: "key",
    model: { model: "qwen-plus", isCustomModel: false, customModel: null },
  },
] as TranslateProviderConfig[]

describe("ProviderMultiSelect", () => {
  it("opens a multi-provider checklist and toggles providers without closing", () => {
    const onSelectedIdsChange = vi.fn()

    render(
      <ProviderMultiSelect
        providers={providers}
        selectedIds={["deepseek"]}
        onSelectedIdsChange={onSelectedIdsChange}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.selectProviders" }))

    expect(screen.getByRole("menu", { name: "translationWorkbench.selectProviders" })).toBeInTheDocument()
    expect(screen.getByRole("menuitemcheckbox", { name: /DeepSeek-V4-Pro/ })).toHaveAttribute("aria-checked", "true")

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Qwen3.5-plus/ }))

    expect(onSelectedIdsChange).toHaveBeenCalledWith(["deepseek", "qwen"])
    expect(screen.getByRole("menu", { name: "translationWorkbench.selectProviders" })).toBeInTheDocument()
  })

  it("does not allow deselecting the last provider", () => {
    const onSelectedIdsChange = vi.fn()

    render(
      <ProviderMultiSelect
        providers={providers}
        selectedIds={["deepseek"]}
        onSelectedIdsChange={onSelectedIdsChange}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.selectProviders" }))
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /DeepSeek-V4-Pro/ }))

    expect(onSelectedIdsChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the provider multi-select tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/provider-multi-select.test.tsx
```

Expected: fails because the current `Select` trigger does not expose the expected popover checklist roles and close behavior.

- [ ] **Step 3: Implement the Popover checklist**

Modify `apps/extension/src/components/translation-workbench/provider-multi-select.tsx`.

Replace the `Select` imports with:

```tsx
import { IconCheck, IconChevronDown } from "@tabler/icons-react"
import { Button } from "@/components/ui/base-ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/base-ui/popover"
```

Keep `ProviderIconStack`, `WorkbenchProviderLogo`, grouping helpers, and provider grouping.

Inside `ProviderMultiSelect`, add:

```tsx
  function toggleProvider(providerId: string) {
    if (selectedIds.includes(providerId)) {
      if (selectedIds.length <= 1)
        return
      onSelectedIdsChange(selectedIds.filter(id => id !== providerId))
      return
    }

    onSelectedIdsChange([...selectedIds, providerId])
  }
```

Return this JSX:

```tsx
    <Popover>
      <PopoverTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            aria-label={i18n.t("translationWorkbench.selectProviders")}
            className="h-10 min-w-36 rounded-full border-0 bg-muted px-3 shadow-none hover:bg-muted/80"
          >
            {selectedProviders.length > 0
              ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <ProviderIconStack providers={selectedProviders} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {selectedProviders.length}
                    </span>
                  </span>
                )
              : (
                  <span className="truncate text-muted-foreground">
                    {i18n.t("translationWorkbench.selectProviders")}
                  </span>
                )}
            <IconChevronDown className="size-4 text-muted-foreground" />
          </Button>
        )}
      />
      <PopoverContent
        container={portalContainer}
        align="end"
        sideOffset={8}
        positionerClassName="z-[2147483647]"
        className="z-[2147483647] max-h-[min(28rem,var(--available-height))] w-80 overflow-y-auto p-2"
      >
        <div role="menu" aria-label={i18n.t("translationWorkbench.selectProviders")} className="space-y-2">
          {providerGroups.map(group => (
            <section key={group.id} className="space-y-1">
              <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {i18n.t(group.labelKey)}
              </h3>
              {group.providers.map((provider) => {
                const checked = selectedIds.includes(provider.id)
                return (
                  <button
                    key={provider.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => toggleProvider(provider.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="grid size-4 place-items-center rounded border border-border">
                        {checked && <IconCheck className="size-3" />}
                      </span>
                      <WorkbenchProviderLogo provider={provider} theme={theme} size="sm" />
                    </span>
                    {isGetuProProvider(provider) && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Pro
                      </span>
                    )}
                  </button>
                )
              })}
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
```

- [ ] **Step 4: Run the provider multi-select tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/provider-multi-select.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Add a sidebar text-tab integration assertion**

In `apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx`, remove the mock for `@/components/translation-workbench/provider-multi-select` in one new integration-style test file section, or add a dedicated test file if that mock is needed for existing tests. The assertion should render `SidebarTextTab`, click the provider trigger, select a second provider, and assert two result-card render calls.

Use this provider config in the test:

```ts
providersConfig: atom([
  {
    id: "deepseek",
    name: "DeepSeek-V4-Pro",
    provider: "deepseek",
    enabled: true,
    apiKey: "test",
    model: { model: "deepseek-chat", isCustomModel: false, customModel: null },
  },
  {
    id: "qwen",
    name: "Qwen3.5-plus",
    provider: "alibaba",
    enabled: true,
    apiKey: "test",
    model: { model: "qwen-plus", isCustomModel: false, customModel: null },
  },
])
```

Expected assertion after selecting Qwen:

```tsx
expect(screen.getByText("DeepSeek-V4-Pro")).toBeInTheDocument()
expect(screen.getByText("Qwen3.5-plus")).toBeInTheDocument()
```

- [ ] **Step 6: Run sidebar text-tab tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/extension/src/components/translation-workbench/provider-multi-select.tsx apps/extension/src/components/translation-workbench/__tests__/provider-multi-select.test.tsx apps/extension/src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
git commit -m "fix(extension): make sidebar provider picker interactive"
```

---

## Task 5: Harden Source and Target Language Selection

**Files:**
- Modify: `apps/extension/src/components/translation-workbench/language-picker.tsx`
- Modify: `apps/extension/src/components/translation-workbench/__tests__/language-picker.test.tsx`

- [ ] **Step 1: Expand language-picker tests**

In `apps/extension/src/components/translation-workbench/__tests__/language-picker.test.tsx`, ensure these tests exist:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkbenchLanguagePicker } from "../language-picker"

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

describe("WorkbenchLanguagePicker", () => {
  it("selects source and target languages from portaled content", () => {
    const onSourceChange = vi.fn()
    const onTargetChange = vi.fn()

    render(
      <WorkbenchLanguagePicker
        source="auto"
        target="cmn"
        onSourceChange={onSourceChange}
        onTargetChange={onTargetChange}
        onSwap={vi.fn()}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("combobox", { name: /translationWorkbench\.languages\.auto/ }))
    fireEvent.click(screen.getByRole("option", { name: "languages.eng" }))
    expect(onSourceChange).toHaveBeenCalledWith("eng")

    fireEvent.click(screen.getByRole("combobox", { name: /languages\.cmn/ }))
    fireEvent.click(screen.getByRole("option", { name: "languages.jpn" }))
    expect(onTargetChange).toHaveBeenCalledWith("jpn")
  })

  it("disables swap only while source is auto", () => {
    const onSwap = vi.fn()
    const { rerender } = render(
      <WorkbenchLanguagePicker
        source="auto"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={onSwap}
        portalContainer={document.body}
      />,
    )

    expect(screen.getByRole("button", { name: "translationWorkbench.swapLanguages" })).toBeDisabled()

    rerender(
      <WorkbenchLanguagePicker
        source="eng"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={onSwap}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.swapLanguages" }))
    expect(onSwap).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run language-picker tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/language-picker.test.tsx
```

Expected: failures identify current accessibility names or portal interaction gaps.

- [ ] **Step 3: Harden the language picker**

In `apps/extension/src/components/translation-workbench/language-picker.tsx`, keep the existing `Select` implementation but add explicit accessible labels and higher z-index portal positioning.

Update the source `SelectTrigger`:

```tsx
        <SelectTrigger
          aria-label={getLanguageLabel(source)}
          className="h-12 min-w-0 rounded-none border-0 bg-transparent px-3 text-sm font-medium shadow-none sm:px-4"
        >
```

Update source `SelectContent`:

```tsx
        <SelectContent
          container={portalContainer}
          positionerClassName="z-[2147483647]"
          className="z-[2147483647]"
        >
```

Update the target `SelectTrigger`:

```tsx
        <SelectTrigger
          aria-label={getLanguageLabel(target)}
          className="h-12 min-w-0 rounded-none border-0 bg-transparent px-3 text-sm font-medium shadow-none sm:px-4"
        >
```

Update target `SelectContent`:

```tsx
        <SelectContent
          container={portalContainer}
          positionerClassName="z-[2147483647]"
          className="z-[2147483647]"
        >
```

If Base UI Select remains unreliable in the test after these changes, replace the two language `Select` blocks with the same `Popover` + button list pattern from Task 4. Keep the public props unchanged.

- [ ] **Step 4: Run language-picker tests again**

Run:

```bash
pnpm --filter @getu/extension test -- src/components/translation-workbench/__tests__/language-picker.test.tsx
```

Expected: all language picker tests pass.

- [ ] **Step 5: Run sidebar text-tab tests**

Run:

```bash
pnpm --filter @getu/extension test -- src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/extension/src/components/translation-workbench/language-picker.tsx apps/extension/src/components/translation-workbench/__tests__/language-picker.test.tsx
git commit -m "fix(extension): make sidebar language picker interactive"
```

---

## Task 6: Verify Sidebar Locale Hydration

**Files:**
- Create: `apps/extension/src/entrypoints/side.content/__tests__/i18n-hydration.test.tsx`
- Modify: `apps/extension/src/entrypoints/side.content/index.tsx` only when the locale hydration test proves production hydration is missing.
- Modify: `apps/extension/src/locales/en.yml` only when a sidebar string key is missing.
- Modify: `apps/extension/src/locales/zh-CN.yml` only when a sidebar string key is missing.

- [ ] **Step 1: Write the side.content locale hydration test**

Create `apps/extension/src/entrypoints/side.content/__tests__/i18n-hydration.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { baseUILocalePreferenceAtom, I18nReactiveRoot } from "@/utils/i18n"
import App from "../app"
import { isSideOpenAtom } from "../atoms"

vi.mock("#imports", () => ({
  browser: {
    runtime: { getURL: (path = "") => `chrome-extension://test${path}` },
    i18n: { getUILanguage: () => "zh-CN" },
  },
  storage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    watch: vi.fn(() => () => undefined),
  },
}))

vi.mock("@/components/frog-toast", () => ({
  default: () => null,
}))

vi.mock("../components/floating-button", () => ({
  default: () => null,
}))

vi.mock("../components/side-content/sidebar-text-tab", () => ({
  SidebarTextTab: () => <h2>文本翻译</h2>,
}))

vi.mock("../components/side-content/sidebar-document-tab", () => ({
  SidebarDocumentTab: () => <h2>文档翻译</h2>,
}))

function HydrateAtoms({ children }: { children: ReactNode }) {
  useHydrateAtoms([
    [configAtom, DEFAULT_CONFIG],
    [baseUILocalePreferenceAtom, "auto"],
  ])
  return children
}

describe("side.content i18n hydration", () => {
  it("renders sidebar copy using the browser locale when preference is auto", () => {
    const store = createStore()
    store.set(isSideOpenAtom, true)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <HydrateAtoms>
            <I18nReactiveRoot>
              <App />
            </I18nReactiveRoot>
          </HydrateAtoms>
        </JotaiProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByRole("tab", { name: "文本" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "文档" })).toBeInTheDocument()
    expect(screen.getByLabelText("关闭侧边栏")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the locale hydration test**

Run:

```bash
pnpm --filter @getu/extension test -- src/entrypoints/side.content/__tests__/i18n-hydration.test.tsx
```

Expected: pass if current `side.content` hydration already works; otherwise fail with English labels.

- [ ] **Step 3: Fix only if the test fails**

If the test fails, inspect `apps/extension/src/entrypoints/side.content/index.tsx` and ensure all of these remain true:

```tsx
const [themeMode, uiLocalePref] = await Promise.all([
  getLocalThemeMode(),
  hydrateI18nFromStorage(),
])
```

and:

```tsx
<HydrateAtoms
  initialValues={[
    [configAtom, config],
    [baseThemeModeAtom, themeMode],
    [baseUILocalePreferenceAtom, uiLocalePref],
  ]}
>
```

and:

```tsx
<I18nReactiveRoot>
  <App />
</I18nReactiveRoot>
```

If these are present, fix the test mock/import path instead of changing production code.

- [ ] **Step 4: Run locale key tests and prepare if locale files changed**

Run:

```bash
pnpm --filter @getu/extension test -- src/locales/__tests__/translation-workbench.test.ts src/entrypoints/side.content/__tests__/i18n-hydration.test.tsx
```

If any locale YAML file changed, run:

```bash
pnpm --filter @getu/extension wxt prepare
```

Expected: tests pass; `wxt prepare` completes without type generation errors.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/extension/src/entrypoints/side.content/__tests__/i18n-hydration.test.tsx apps/extension/src/entrypoints/side.content/index.tsx apps/extension/src/locales/en.yml apps/extension/src/locales/zh-CN.yml apps/extension/src/locales/zh-TW.yml apps/extension/src/locales/ja.yml apps/extension/src/locales/ko.yml apps/extension/src/locales/ru.yml apps/extension/src/locales/tr.yml apps/extension/src/locales/vi.yml
git commit -m "test(extension): cover sidebar locale hydration"
```

---

## Task 7: Final Extension Validation

**Files:**
- No source files expected.

- [ ] **Step 1: Run focused sidebar/workbench tests**

Run:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- src/entrypoints/side.content/utils/__tests__/sidebar-open-state.test.ts src/entrypoints/side.content/components/side-content/__tests__/sidebar-shell.test.tsx src/entrypoints/side.content/components/side-content/__tests__/side-content-reflow.test.tsx src/entrypoints/side.content/components/floating-button/__tests__/index.test.tsx src/components/translation-workbench/__tests__/provider-logo.test.tsx src/components/translation-workbench/__tests__/provider-multi-select.test.tsx src/components/translation-workbench/__tests__/language-picker.test.tsx src/components/translation-workbench/__tests__/result-card.test.tsx src/entrypoints/side.content/components/side-content/__tests__/sidebar-text-tab.test.tsx src/entrypoints/side.content/__tests__/i18n-hydration.test.tsx src/locales/__tests__/translation-workbench.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 2: Run extension type-check**

Run:

```bash
pnpm --filter @getu/extension type-check
```

Expected: TypeScript exits 0.

- [ ] **Step 3: Run lint on changed extension files**

Run:

```bash
pnpm --filter @getu/extension lint -- src/entrypoints/side.content src/components/translation-workbench src/locales
```

Expected: ESLint exits 0.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified. No `.superpowers/`, build output, or generated files are present unless `wxt prepare` intentionally changed WXT type files.

- [ ] **Step 5: Commit final validation notes only if files changed**

If Step 4 shows no files, do not commit. If `wxt prepare` generated required files, commit them with:

```bash
git add apps/extension/.wxt apps/extension/src/locales
git commit -m "chore(extension): refresh generated locale types"
```
