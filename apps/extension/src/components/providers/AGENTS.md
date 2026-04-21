<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# providers

## Purpose

React context providers shared across entrypoints. Currently houses the theme provider, which bridges the persisted `themeMode` Jotai atom (`light` | `dark` | `system`) to a resolved `theme` (`light` | `dark`) by listening to `prefers-color-scheme` via `useSyncExternalStore`, then applies the result to either `document.documentElement` or a caller-supplied `container` (used for shadow-DOM hosts) through `applyTheme`.

## Key Files

| File                 | Description                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme-provider.tsx` | Exports `ThemeContext`, `ThemeProvider`, and the `useTheme()` hook (throws if used outside the provider). Recomputes the resolved `theme` on every system change and writes it via `useLayoutEffect` to avoid flash-of-wrong-theme. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Mount `<ThemeProvider>` once per surface. For shadow-DOM mounts (content-script overlays, selection popover), pass `container={shadowHostElement}` so `applyTheme` writes the `dark`/`light` class onto the shadow root, not the page document.
- Read theme via `useTheme()`; do not subscribe to `themeModeAtom` directly in components - the provider already memoizes the context value and resolves `system` to a concrete theme.
- Stick with `useSyncExternalStore` for media-query subscription; it avoids the SSR/hydration pitfalls of plain `useEffect` listeners and keeps the provider tree-render-safe.
- Add new providers as sibling files in this folder; keep one provider per file and export the `Context`, the `Provider`, and the `useX` hook together.

### Testing Requirements

- Vitest + `@testing-library/react`. Mock `window.matchMedia` (and the Jotai store with a stub `themeModeAtom`) to drive both `system` and explicit modes. Assert that `applyTheme` is called with the right element and that `useTheme()` outside the provider throws.

### Common Patterns

- Context value memoized with `useMemo` so consumers using `setThemeMode` don't re-render when only `theme` changes.
- `useLayoutEffect` to apply theme classes synchronously before paint.
- React 19 `use(ThemeContext)` instead of `useContext` for the hook.

## Dependencies

### Internal

- `@/types/config/theme` - `Theme`, `ThemeMode` types.
- `@/utils/atoms/theme#themeModeAtom` - persisted theme preference.
- `@/utils/theme#applyTheme` - writes the `light`/`dark` class onto a target element.

### External

- `jotai` - `useAtom` for theme mode.
- `react@19` - `createContext`, `use`, `useLayoutEffect`, `useMemo`, `useSyncExternalStore`.

<!-- MANUAL: -->
