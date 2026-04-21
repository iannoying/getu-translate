<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# renderer

## Purpose

Imperative DOM mount layer for the subtitles content script. Bridges between the `UniversalVideoAdapter` (which lives in plain JS classes) and React: one entry mounts the full subtitle overlay + settings panel as a single Shadow Root attached to the platform's player container, and the other mounts the small Read Frog logo button into the platform's native controls bar (e.g., YouTube's `.ytp-right-controls`). Both use the project's shared `react-shadow-host` utilities so Tailwind/theme styles do not leak into the host page.

## Key Files

| File                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mount-subtitles-ui.tsx`     | `mountSubtitlesUI({ adapter, config })` — waits for the player container, ensures it is `position: relative`, dedupes `#read-frog-subtitles-ui-host`, attaches an open Shadow Root, builds a React root via `ShadowHostBuilder`, and renders `SubtitlesContainer` inside `JotaiProvider(subtitlesStore)` + `ThemeProvider` + `ShadowWrapperContext` + `SubtitlesUIContext`. Stores `__reactShadowContainerCleanup` on the host element. |
| `render-translate-button.ts` | `renderSubtitlesTranslateButton()` — returns (or reuses) the `TRANSLATE_BUTTON_CONTAINER_ID` div, mounted via `createReactShadowHost` in `inline` position with `wrapperCSS` that flexes the button to fit the controls bar.                                                                                                                                                                                                            |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- `mountSubtitlesUI` is idempotent only at the host level (`existingHost.parentElement === parentEl` short-circuits) — adapter recreation is the caller's responsibility (see `init-youtube-subtitles.ts`).
- The React root cleanup is stashed on the host as `__reactShadowContainerCleanup` so SPA navigation can fully tear down React before re-mounting; preserve this hook if you refactor.
- The host `<div>` uses `pointer-events: none` with `transition: bottom 0.2s ease-out`; child overlays opt back in with `pointer-events: auto` so video controls remain clickable through the empty regions.
- `SubtitlesUIContext` is the only React-side hook that reaches back into the adapter — keep its surface minimal (`toggleSubtitles`, `downloadSourceSubtitles`, `controlsConfig`).
- The translate-button host id `TRANSLATE_BUTTON_CONTAINER_ID` is also queried by `universal-adapter.renderTranslateButton` to remove a stale instance before re-inserting; do not rename without updating both sides.

### Testing Requirements

- No co-located tests. Indirect coverage comes from `../__tests__/universal-adapter.test.ts`.
- `pnpm test` runs Vitest. Shadow-DOM mounting is hard to test in jsdom; prefer logic tests on the adapter and rely on manual QA on YouTube for the renderer.

### Common Patterns

- Shadow Root isolation via `attachShadow({ mode: "open" })` plus `ShadowHostBuilder` injecting `theme.css?inline` so Tailwind `dark:` variants resolve inside the shadow.
- Imperative React mount-in-shadow (`ReactDOM.createRoot` over a `ShadowHostBuilder`-built container) rather than WXT's `createShadowRootUi` because this script needs a host attached to a non-`body` parent and per-navigation re-mount.
- Defensive parent positioning: forces `position: relative` on the player container so the absolutely positioned overlay anchors to the video, not the document.
- Sibling instead of child: the controls-bar button is `inline` shadow-host inserted as the first child of `.ytp-right-controls`, while the overlay host is appended to `#movie_player` — they are decoupled and re-render independently.

## Dependencies

### Internal

- `@/utils/react-shadow-host/shadow-host-builder` (`ShadowHostBuilder`), `@/utils/react-shadow-host/create-shadow-host` (`createReactShadowHost`, `ShadowWrapperContext`).
- `@/components/providers/theme-provider`, `@/utils/constants/dom-labels` (`REACT_SHADOW_HOST_CLASS`), `@/utils/constants/subtitles` (`TRANSLATE_BUTTON_CONTAINER_ID`).
- `@/utils/dom/wait-for-element` for player-container readiness.
- `@/assets/styles/theme.css?inline` — Tailwind theme tokens injected into each shadow.
- Sibling modules: `../atoms` (`subtitlesStore`), `../ui/subtitles-container`, `../ui/subtitles-ui-context`, `../ui/subtitles-translate-button`.

### External

- `react`, `react-dom/client` — root creation inside the shadow.
- `jotai` — `Provider` bound to the dedicated `subtitlesStore`.
- `sonner` — `Toaster` rendered inside the shadow with a `notranslate` class so Google Translate does not mangle toast text.

<!-- MANUAL: -->
