<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# sidepanel

## Purpose

Chrome native Side Panel entrypoint. Renders the full translation workbench (`SidebarShell`) inside Chrome's built-in side panel UI (activated via `chrome.sidePanel`). Complements `side.content/` (which mounts the same UI in a Shadow DOM overlay within the page); the native side panel persists across navigations and survives page reloads without re-injection.

## Key Files

| File         | Description                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` | HTML shell for the side panel page. Loaded by Chrome when the side panel opens.                                                                                      |
| `main.tsx`   | React root bootstrap — mounts `<App />` into `#app` with `JotaiProvider` / `QueryClientProvider` / `ThemeProvider`.                                                  |
| `app.tsx`    | `<App />` component — renders `<SidebarShell>` full-height, wires `onClose` to `sendMessage("closeNativeSidePanel")` so the background service worker closes the panel. |

## Subdirectories

| Directory    | Purpose                              |
| ------------ | ------------------------------------ |
| `__tests__/` | Vitest tests for the App component   |

## For AI Agents

### Working In This Directory

- The native side panel is **Chrome-only** — guard any sidepanel-specific code behind a browser check or feature detection (`hasNativeSidePanelSupport()` from `background/native-side-panel.ts`).
- `SidebarShell` is the same component used in `side.content/` — changes there affect both surfaces.
- Closing the panel is done by messaging the background (`closeNativeSidePanel`), which calls `chrome.sidePanel.close()`. Do not call `window.close()`.
- The side panel is opened by the background service worker (`openNativeSidePanel`) in response to a toolbar action, not by content scripts.
- WXT auto-registers this as a side panel entry; ensure `wxt.config.ts` includes the `sidePanel` permission and `side_panel` manifest fields.

### Testing Requirements

- Unit-test `app.tsx` with a mocked `sendMessage` to verify `onClose` triggers the correct message.
- Integration: use `background/__tests__/native-side-panel.test.ts` patterns for handler testing.

### Common Patterns

- Page entrypoint pattern: `index.html` + `main.tsx` boots a React tree; `app.tsx` is the root component.
- `portalContainer={document.body}` is passed to `SidebarShell` since there is no Shadow DOM in the native panel — modals/tooltips render into `document.body` directly.

## Dependencies

### Internal

- `@/components/translation-workbench/sidebar-shell` — shared sidebar UI component.
- `@/utils/message` — typed `sendMessage` for `closeNativeSidePanel`.
- `@/utils/extension-lifecycle` — `swallowExtensionLifecycleError` for safe teardown.

### External

- `react`, `jotai`, `@tanstack/react-query` — UI framework and state.
- `#imports` (WXT) — `browser` polyfill, `storage`, `i18n`.

<!-- MANUAL: -->
