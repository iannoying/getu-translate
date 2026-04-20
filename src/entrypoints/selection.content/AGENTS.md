<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# selection.content

## Purpose

WXT content script (matches `*://*/*` and `file:///*`, `allFrames: true`) that adds Read Frog's text-selection translation surface to every page. After global site-control gating, it mounts a single Shadow Root via WXT's `createShadowRootUi` anchored to `<body>`, hosts the `<SelectionToolbar>` (the floating action bar shown after a mouse selection) and the `<SelectionTranslationProvider>` / `<SelectionCustomActionProvider>` popovers (translation results and structured custom-action outputs), wires up the `useInputTranslation()` hot-key (triple-space) for translating focused `<input>` / `<textarea>` / `contenteditable` content in place, and routes context-menu requests sent from the background script. Selection state is captured as immutable `SelectionSnapshot` + `ContextSnapshot` (built by walking surrounding paragraph-like ancestors across shadow boundaries).

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`         | WXT `defineContentScript` entrypoint — double-injection guard, site-control check, theme hydration, `createShadowRootUi` + React mount with QueryClient/Jotai/Theme/Tooltip providers. Exports the live `shadowWrapper` element used as portal `container` by popovers/tooltips.                      |
| `app.tsx`           | Composes `SelectionTranslationProvider` + `SelectionCustomActionProvider` + `SelectionToolbar` + `Toaster`; activates `useInputTranslation()`; reflects `selectionToolbar.opacity` config onto a CSS custom property `--rf-selection-opacity`.                                                        |
| `utils.ts`          | Selection model: `SelectionSnapshot`/`ContextSnapshot` types, shadow-DOM-aware range snapshotting (`getComposedRanges` with shadow-root fallback), `buildContextSnapshot()` (walks paragraph-like / semantic ancestors), `truncateContextTextForCustomAction`, zero-width / whitespace normalization. |
| `overlay-layers.ts` | Z-index tier constants (`z-2147483646`/`z-2147483647`) and the `data-rf-selection-overlay-root` attribute used by `SelectionToolbar` and friends to detect "is this event inside our overlay".                                                                                                        |

## Subdirectories

| Directory            | Purpose                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/`        | Shared widgets used by both the toolbar popovers (copy/speak/source-content/error/title/footer/tooltip). (see `components/AGENTS.md`)                                                               |
| `input-translation/` | The triple-space-bar in-place input translation hook with native undo support. (see `input-translation/AGENTS.md`)                                                                                  |
| `selection-toolbar/` | The floating toolbar shown after a selection plus its translate-button and custom-action popovers; selection-session atoms and context-menu request resolution. (see `selection-toolbar/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- The script runs in every frame (`allFrames: true`) and on `file:///*` — keep it cheap and avoid assumptions about `window === window.top`.
- Site-control is checked once at script start; the overlay does not re-evaluate when the user changes site enabling at runtime — they must reload.
- `shadowWrapper` is exported as a `let` on purpose because Base UI portals (`PopoverContent`, `DropdownMenuContent`, `TooltipContent`) need a live container reference; never replace it with a hook.
- Prevent host-page `Ctrl+A` capture and Iconify background fetch are wired in `mountSelectionUI` — preserve `protectSelectAllShadowRoot` and `ensureIconifyBackgroundFetch` if refactoring the mount flow.
- Selection range collection uses the modern `Selection.getComposedRanges({ shadowRoots })` API with a fallback to legacy `getRangeAt`; both branches must keep returning `SelectionRangeSnapshot[]`.

### Testing Requirements

- Tests live in `__tests__/utils.test.ts` and per-subdirectory `__tests__/`.
- Run `pnpm test`. `SKIP_FREE_API=true` is unrelated to this directory but may apply to translator utilities the toolbar depends on.
- When testing selection logic, construct fake `Selection`/`Range` via jsdom or stub `readSelectionSnapshot`/`buildContextSnapshot`.

### Common Patterns

- Shadow-DOM mount via WXT's `createShadowRootUi` (`position: "overlay"`, `anchor: "body"`) — distinct from the subtitles overlay which uses raw `attachShadow`.
- Cross-shadow-root traversal: `getParentNodeAcrossShadow` / `getParentElementAcrossShadow` walk up through `ShadowRoot.host` boundaries when collecting paragraph context.
- Selection sessions: every captured selection becomes an immutable `SelectionSession` (id + timestamp + snapshot + context) so popovers can hold a stable reference even after the live `Selection` is cleared.
- Z-layer + attribute marker (`data-rf-selection-overlay-root`) instead of `contains()` checks, so portaled tooltips/popovers in detached subtrees still register as "inside the overlay" and do not dismiss the toolbar.
- Hydrating `baseThemeModeAtom` via `useHydrateAtoms` so the first paint inside the shadow uses the persisted theme mode instead of flickering through the default.

## Dependencies

### Internal

- `@/components/providers/theme-provider`, `@/components/ui/base-ui/tooltip` — providers wrapping the React tree.
- `@/utils/config/storage` (`getLocalConfig`), `@/utils/site-control`, `@/utils/atoms/theme`, `@/utils/theme`, `@/utils/select-all`, `@/utils/shadow-root`, `@/utils/styles`, `@/utils/iconify/setup-background-fetch`.
- `@/utils/tanstack-query` — shared `queryClient` for `SaveToNotebaseButton` and other `@tanstack/react-query` consumers.
- `@/utils/zod-config` — Zod global config (must be imported for side effects before any schema parsing).

### External

- `#imports` (WXT) — `defineContentScript`, `createShadowRootUi`, `i18n`.
- `react`, `react-dom/client`, `jotai` (+ `jotai/utils.useHydrateAtoms`), `@tanstack/react-query`.
- `case-anything` — `kebabCase` for the shadow root tag name.
- `sonner` — toast surface portaled into the shadow.

<!-- MANUAL: -->
