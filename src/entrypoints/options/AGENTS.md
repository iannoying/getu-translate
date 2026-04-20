<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# options

## Purpose

The full-page settings UI rendered into the WXT options entrypoint. Boots a `JotaiProvider` + `QueryClientProvider` + `HashRouter` shell, hydrates the persisted `Config` and theme atom, then composes a `SidebarProvider` layout where `<AppSidebar />` (left rail) sits next to `<App />` (lazy-loaded routed pages). A floating `<HelpButton />` and a global `<SettingsSearch />` (cmdk command palette opened by Cmd/Ctrl+K) sit on top of every route. Each route is code-split via `React.lazy`.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx`   | Async boot — loads config + theme, calls `applyTheme(documentElement, ...)` before mount, then `renderPersistentReactRoot` of the provider tree (`Jotai → HydrateAtoms → QueryClient → HashRouter → SidebarProvider → ThemeProvider → TooltipProvider → RecoveryBoundary → AppSidebar + App + HelpButton + SettingsSearch`). |
| `app.tsx`    | Router — defines `ROUTE_COMPONENTS` (a `Record<RoutePath, ComponentType>`), wraps `<Routes>` in `<Suspense fallback={<RouteLoadingFallback/>}>`, and lazy-imports every page module. `GeneralPage` is eager (default landing).                                                                                               |
| `index.html` | WXT entrypoint HTML mounting `main.tsx` into `#root`.                                                                                                                                                                                                                                                                        |
| `style.css`  | Options-only CSS overrides layered on top of `@/assets/styles/theme.css`.                                                                                                                                                                                                                                                    |

## Subdirectories

| Directory          | Purpose                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `app-sidebar/`     | Left navigation rail with grouped settings/tools/product menus and the "what's new" popover (see `app-sidebar/AGENTS.md`). |
| `command-palette/` | cmdk-based global search across settings sections (see `command-palette/AGENTS.md`).                                       |
| `components/`      | Page-shared layout primitives (`PageLayout`, `ConfigCard`, `EntityEditorLayout`, etc.) (see `components/AGENTS.md`).       |
| `pages/`           | One subdirectory per route, each exporting a `<XxxPage />` component (see `pages/AGENTS.md`).                              |

## For AI Agents

### Working In This Directory

- Routing is `HashRouter` (extension pages are loaded from a `chrome-extension://` URL where `BrowserRouter` would not work). Always use `Link` / `useNavigate` / `useLocation` from `react-router`, never `window.location`.
- The set of routes is the single source of truth in `app-sidebar/nav-items.ts` (`ROUTE_DEFS`). `app.tsx` builds its `<Route>` list from that array — adding a route requires updating both `ROUTE_DEFS` (path) and `ROUTE_COMPONENTS` (lazy import).
- `tts` is conditionally excluded on Firefox via `import.meta.env.BROWSER === "firefox"` in both `nav-items.ts` and `command-palette/search-items.ts`. Replicate that gate when adding browser-specific routes.
- Theme is applied to `document.documentElement` **before** mount in `main.tsx` to avoid FOUC; do not move that into `ThemeProvider`.
- The page width comes from `<Container>` inside `PageLayout`. Pages should use `PageLayout`/`ConfigCard` rather than rolling their own headers.
- `RecoveryBoundary` wraps both sidebar and routed content — error boundaries belong inside it, not outside.

### Testing Requirements

`pnpm test` (Vitest + jsdom + Testing Library). Co-located tests live under `__tests__/` in subdirectories (e.g. `app-sidebar/__tests__/whats-new-footer.test.tsx`, `command-palette/__tests__/`, `pages/api-providers/.../__tests__/`). Provider connection-button tests can hit network — set `SKIP_FREE_API=true` to skip live-API tests.

### Common Patterns

- Lazy route module shape: `lazy(() => import("./pages/<name>").then(m => ({ default: m.<Name>Page })))`. Each page exports `<Name>Page` (named export), wrapped by the lazy importer.
- Cmd/Ctrl+K is wired in `command-palette/settings-search.tsx`; see `getCommandPaletteShortcutHint()` in `@/utils/os` for the platform-correct hint.

## Dependencies

### Internal

- `@/utils/atoms/config`, `@/utils/atoms/theme`, `@/utils/config/storage`, `@/utils/constants/config`
- `@/utils/react-root`, `@/utils/tanstack-query`, `@/utils/theme`, `@/utils/zod-config`
- `@/components/providers/theme-provider`, `@/components/recovery/recovery-boundary`, `@/components/frog-toast`, `@/components/help-button`
- `@/components/ui/base-ui/sidebar`, `@/components/ui/base-ui/tooltip`

### External

- `react` 19, `react-router` 7 (`HashRouter`, `Routes`, `Route`, `Link`, `useNavigate`, `useLocation`)
- `jotai` + `jotai/utils`, `@tanstack/react-query`
- `cmdk` (via `@/components/ui/base-ui/command`)

<!-- MANUAL: -->
