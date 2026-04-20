<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# components

## Purpose

React UI for the sidebar content script. Two subdirectories split the surface area: `floating-button/` is the always-visible toolbar pinned to the right edge of the viewport (translate toggle, settings shortcut, drag-to-reposition, per-site/global disable menu), and `side-content/` is the slide-in drawer panel that takes over the right gutter when opened. Both consume the shared atoms from `../atoms.ts` and the global config atoms from `@/utils/atoms/config`.

## Key Files

This directory has no top-level files — only subdirectories.

## Subdirectories

| Directory          | Purpose                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `floating-button/` | The right-edge floating button cluster: drag-to-position logo, dropdown close-menu (disable for site / disable globally), and the translate toggle button. Contains `index.tsx`, `translate-button.tsx`, and a nested `components/hidden-button.tsx`. (See `floating-button/__tests__/` for coverage examples.) |
| `side-content/`    | The slide-in drawer (`index.tsx`): resizable from the left edge with `MIN_SIDE_CONTENT_WIDTH` clamp, injects a `<style>` tag that shrinks `html { width: ... !important }` while open so host-page content reflows. Currently a placeholder pending feature reactivation ("The function is being upgraded").    |

## For AI Agents

### Working In This Directory

- All click/drag handlers must coexist with the host page's own listeners — use `e.preventDefault()` + `e.stopPropagation()` at the right boundaries (the floating-button drag handler distinguishes click vs drag with a 5 px `clientY` threshold).
- Translation state is read via `useAtomValue(enablePageTranslationAtom)` and toggled via `sendMessage("tryToSetEnablePageTranslationOnContentScript", { enabled, analyticsContext })` — never set the atom directly; let the background round-trip update session storage and re-emit.
- Config slices come from `configFieldsAtomMap` (e.g. `floatingButton`, `sideContent`) — these are read-write atoms whose setter persists to local storage. Always spread the existing slice when partially updating (`setFloatingButton({ ...floatingButton, enabled: false })`).
- Shadow-DOM portals: dropdown menus must pass `container={shadowWrapper}` (imported from `../../index`) so Floating UI renders inside the shadow root.
- Use the project z-index sentinel `z-2147483647` for top-most layers (host pages can use `2147483647`, so we match it).
- Per-domain disable lives in `floatingButton.disabledFloatingButtonPatterns` and is matched via `matchDomainPattern` from `@/utils/url`.
- Sidebar resize math is `windowWidth - e.clientX` clamped to `MIN_SIDE_CONTENT_WIDTH`; while resizing, render a transparent fullscreen overlay so iframes/host elements don't steal `mousemove`.

### Testing Requirements

Co-located `__tests__/` per component (already present at `floating-button/__tests__/`). Use Vitest + `@testing-library/react` and wrap mounts with `<JotaiProvider store={...}>` plus `useHydrateAtoms` of `configAtom` and `enablePageTranslationAtom` to mirror `app.tsx`. Mock `@/utils/message` (`sendMessage`) and `#imports` (`browser`, `i18n`).

### Common Patterns

- "Drag vs click" detection in `floating-button/index.tsx`: capture initial `clientY`, mark `hasMoved` once the delta exceeds 5 px, only fire the click action on `mouseup` if `!hasMoved`.
- Disabling `body { user-select }` during drag/resize prevents text-selection artifacts; always restore in the cleanup branch.
- `--removed-body-scroll-bar-size` (CSS var from `react-remove-scroll-bar`) is honored when positioning right-edge UI so the toolbar doesn't shift when the host page locks scroll.
- `print:hidden` Tailwind utility on the floating cluster keeps it out of `window.print()` output.

## Dependencies

### Internal

- `../atoms` — `isSideOpenAtom`, `isDraggingButtonAtom`, `enablePageTranslationAtom`.
- `../index` — `shadowWrapper` (mutable export, used as portal container).
- `@/utils/atoms/config` — `configFieldsAtomMap` (typed read-write atom slices for each config field).
- `@/utils/message` — `sendMessage` for `tryToSetEnablePageTranslationOnContentScript`, `openOptionsPage`.
- `@/utils/analytics`, `@/types/analytics` — feature-usage context for translate toggles.
- `@/utils/url` — `matchDomainPattern`.
- `@/utils/styles/utils` — `cn` className merger.
- `@/utils/constants/{app,side}` — `APP_NAME`, `MIN_SIDE_CONTENT_WIDTH`.
- `@/components/ui/base-ui/dropdown-menu` — Floating UI–based shadcn-style dropdown.
- `@/assets/icons/read-frog.png` — logo, imported with `?url&no-inline` and resolved against `browser.runtime.getURL`.

### External

- `jotai` / `jotai/react` — `useAtom`, `useAtomValue`.
- `react` — hooks (`useEffect`, `useRef`, `useState`).
- `@tabler/icons-react` (`IconSettings`, `IconX`, `IconCheck`) and `@remixicon/react` (`RiTranslate`) — iconography.
- `case-anything` — `kebabCase` for style-tag IDs.
- `wxt` (`#imports`) — `browser`, `i18n` for translated dropdown labels.

<!-- MANUAL: -->
