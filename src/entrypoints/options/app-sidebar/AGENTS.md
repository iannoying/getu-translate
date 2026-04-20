<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# app-sidebar

## Purpose

The left navigation rail of the options page. Renders the Read Frog logo + version, a click-to-open command-palette input (with platform-aware Cmd/Ctrl+K hint), three grouped menus (`SettingsNav`, `ToolsNav`, `ProductNav`), and a footer popover (`WhatsNewFooter`) that auto-opens when a new blog post is published. Built on shadcn `Sidebar*` primitives with `collapsible="icon"` so the rail collapses to icons.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.tsx`              | `AppSidebar` shell — header with logo + version + command-palette `InputGroup` (clicking sets `commandPaletteOpenAtom = true`), content groups, footer.                                                                                                                                                                        |
| `nav-items.ts`           | `ROUTE_DEFS` — the canonical ordered list of route paths consumed by both `options/app.tsx` (to mount `<Route>`s) and the sidebar (implicitly). Excludes `/tts` on Firefox.                                                                                                                                                    |
| `settings-nav.tsx`       | Settings menu with twelve `SidebarMenuButton` rows wired to `Link`. The `floating-button`/`selection-toolbar`/`context-menu` triplet sits inside a `Collapsible` labeled "Overlay tools"; default-open when the current pathname is one of `OVERLAY_TOOLS_PATHS`. `tts` is hidden on Firefox via `import.meta.env.BROWSER`.    |
| `tools-nav.tsx`          | Single entry — opens `/translation-hub.html` (a separate WXT entrypoint) in a new tab via `browser.runtime.getURL`.                                                                                                                                                                                                            |
| `product-nav.tsx`        | "Survey" link to `https://tally.so/r/kdNN5R`. Uses `useQuery(["last-viewed-survey"], getLastViewedSurvey)` + `hasNewSurvey` to show an `AnimatedIndicator` and bold style; click invokes `saveLastViewedSurvey` then invalidates the query.                                                                                    |
| `animated-indicator.tsx` | A 2.5×2.5 dot with a `animate-ping` halo — used for "new" badges in `ProductNav` and `WhatsNewFooter`.                                                                                                                                                                                                                         |
| `whats-new-footer.tsx`   | Popover trigger (`SidebarMenuButton` with `tabler:rss`) auto-opens once when `hasNewBlogPost(lastViewed, latest)`; renders the Bilibili embed (via `buildBilibiliEmbedUrl`) plus title/description from `getLatestBlogDate(...)`. Uses React 19 `useEffectEvent` to avoid effect-deps churn around `markLatestBlogPostViewed`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- The route order in `nav-items.ts` is **load-bearing** — `options/app.tsx` consumes it in the same order to drive `<Routes>`. Reordering items reorders the visible menu but does not break routing; adding a path here without adding a `ROUTE_COMPONENTS` entry will throw at runtime.
- Active-state highlighting reads `pathname` from `useLocation()`, not the link's `to` prop. Sub-routes inside the `Collapsible` use string equality, not prefix-match.
- The browser-conditional split (`isFirefox`) appears in **both** `nav-items.ts` and `settings-nav.tsx` — keep them aligned.
- The "what's new" auto-open uses `useEffectEvent` (React 19) to read the latest `markLatestBlogPostViewed` without re-subscribing the effect; do not refactor it back to standard callbacks or you will reintroduce the effect-loop the suppression `set-state-in-effect` comment guards against.
- The header `<a href="https://readfrog.app">` is a real navigation, not an in-app link.
- Sidebar header / content / footer use `group-data-[state=expanded]` and `group-data-[state=collapsed]` Tailwind selectors to morph between collapsed (icon-only) and expanded states — preserve those when adjusting padding.

### Testing Requirements

`pnpm test` (Vitest + Testing Library). Co-located test: `__tests__/whats-new-footer.test.tsx`. Mocks `getLatestBlogDate` / `getLastViewedBlogDate`. `SKIP_FREE_API` is irrelevant here.

### Common Patterns

- TanStack Query keys reused with `popup/components/blog-notification.tsx` — `["last-viewed-blog-date"]`, `["latest-blog-post", blogLocale]`. After persisting a new view date, invalidate `["last-viewed-blog-date"]` so both surfaces update.
- "New content" indicators: query persisted last-viewed → compare with current → render `<AnimatedIndicator show={…} />` next to the menu item; persist on click.

## Dependencies

### Internal

- `../command-palette/atoms` (`commandPaletteOpenAtom`)
- `@/components/ui/base-ui/sidebar`, `@/components/ui/base-ui/input-group`, `@/components/ui/base-ui/kbd`, `@/components/ui/base-ui/popover`, `@/components/ui/base-ui/collapsible`
- `@/utils/os` (`getCommandPaletteShortcutHint`), `@/utils/blog`, `@/utils/survey`, `@/utils/styles/utils`
- `@/utils/constants/url` (`WEBSITE_URL`)
- `@/assets/icons/read-frog.png`

### External

- `react-router` 7 (`Link`, `useLocation`), `jotai`, `@tanstack/react-query`
- `@iconify/react`, `@tabler/icons-react`
- `react` 19 (`useEffectEvent`)
- `#imports` (WXT — `browser`, `i18n`)

<!-- MANUAL: -->
