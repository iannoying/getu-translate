<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# side.content

## Purpose

Content script that mounts Read Frog's right-edge sidebar drawer and floating-button toolbar into a Shadow DOM overlay on every host page. Unlike `host.content` (which only runs the in-page translation engine), this entry boots the full React tree — `QueryClientProvider`, a Jotai store with hydrated `configAtom`/`baseThemeModeAtom`, `ThemeProvider`, and `TooltipProvider` — and renders `<FloatingButton />`, `<SideContent />`, and `<FrogToast />`. It is the primary surface for user-facing sidebar tools and the floating translate-toggle button.

## Key Files

| File        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx` | WXT `defineContentScript` with `cssInjectionMode: "ui"`. Loads config + theme, runs `isSiteEnabled` gate, builds the Shadow DOM via `createShadowRootUi`, calls `insertShadowRootUIWrapperInto` and `protectSelectAllShadowRoot`, mirrors goober dynamic styles into shadow, then mounts the React tree with `HydrateAtoms` seeding `configAtom` and `baseThemeModeAtom`. Lazy-loads React Query Devtools in DEV. Exports the mutable `shadowWrapper` reference for portal targets. |
| `app.tsx`   | Tiny root component composing `<FloatingButton />`, `<SideContent />`, and `<FrogToast />`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `atoms.ts`  | The sidebar's local Jotai store (`createStore()`) plus three primitives: `isSideOpenAtom`, `isDraggingButtonAtom`, and `enablePageTranslationAtom` (built from `createTranslationStateAtomForContentScript` for tab-scoped session sync).                                                                                                                                                                                                                                           |

## Subdirectories

| Directory     | Purpose                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `components/` | React UI for the sidebar surface — the floating toolbar button cluster and the resizable drawer (see `components/AGENTS.md`). |
| `utils/`      | Sidebar-local helpers: article paragraph extraction and a Markdown export downloader (see `utils/AGENTS.md`).                 |

## For AI Agents

### Working In This Directory

- The Jotai `store` is **scoped to this entrypoint** (`atoms.ts`) — do not import `getDefaultStore()` from anywhere else; always pass `store` to `<JotaiProvider>` so atoms hydrated by `HydrateAtoms` resolve to the same instance.
- `shadowWrapper` is exported as a mutable binding from `index.tsx` and consumed by portaled UI (e.g. `<DropdownMenuContent container={shadowWrapper}>`); when refactoring, keep the export name and assignment site stable or fix every consumer.
- `enablePageTranslationAtom` is the **single source of truth** for translation state in the sidebar — it sync-mirrors session storage via `createTabSessionAtom`. Use `sendMessage("tryToSetEnablePageTranslationOnContentScript", ...)` to toggle; do not mutate the atom directly.
- `cssInjectionMode: "ui"` means WXT injects the bundle's CSS into the shadow root automatically. New stylesheet imports must be safe inside Shadow DOM (no `:root`-only selectors that depend on document scope).
- The script runs everywhere (`*://*/*`, `file:///*`) but **does not** mount in unsupported sites — keep the `isSiteEnabled` early-return.
- React Query Devtools is gated on `import.meta.env.DEV` and `lazy`-imported; do not unconditionally import it.

### Testing Requirements

Vitest with co-located `__tests__/`. Most coverage lives under `components/floating-button/__tests__/`. When testing this directory, mock `#imports` (WXT's `createShadowRootUi`, `i18n`, `browser`, `storage`), `@/utils/config/storage`, and `@/utils/site-control`. Use `@testing-library/react` with the same `JotaiProvider` + `store` wrapping that `index.tsx` uses so atom hydration matches production.

### Common Patterns

- `useHydrateAtoms` is wrapped inside a `<HydrateAtoms>` component because WXT's `onMount` runs before React renders — this guarantees atoms are seeded before children read them.
- The Shadow DOM is set to `position: "overlay"` with `anchor: "body"` and `append: "last"` to win z-order without disturbing the host page's layout.
- Style protection: `protectInternalStyles()` and `mirrorDynamicStyles("#_goober", shadow)` keep CSS-in-JS output (sonner / goober) reflected into the shadow root.
- `protectSelectAllShadowRoot(shadowHost, wrapper)` defends against host-page `Ctrl+A` selecting our injected UI.

## Dependencies

### Internal

- `@/utils/config/storage` — initial config load.
- `@/utils/site-control` — `isSiteEnabled` gate.
- `@/utils/atoms/config`, `@/utils/atoms/theme`, `@/utils/atoms/translation-state` — shared atoms hydrated here.
- `@/utils/shadow-root` — `insertShadowRootUIWrapperInto`.
- `@/utils/select-all` — `protectSelectAllShadowRoot`.
- `@/utils/tanstack-query` — pre-configured `queryClient` singleton.
- `@/utils/theme`, `@/utils/styles`, `@/utils/constants/{app,config,side}`, `@/utils/message`.
- `@/components/providers/theme-provider`, `@/components/ui/base-ui/tooltip`, `@/components/frog-toast`.
- `../../utils/styles` (entrypoints-level helpers `addStyleToShadow`, `mirrorDynamicStyles`, `protectInternalStyles`).

### External

- `wxt` (`#imports`) — `defineContentScript`, `createShadowRootUi`.
- `jotai` / `jotai/utils` — `Provider`, `createStore`, `useHydrateAtoms`.
- `@tanstack/react-query` and `@tanstack/react-query-devtools` (DEV-only lazy).
- `react` / `react-dom` — UI rendering.
- `case-anything` — `kebabCase` for the shadow root name.

<!-- MANUAL: -->
