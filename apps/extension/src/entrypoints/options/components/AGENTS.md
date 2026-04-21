<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# components

## Purpose

Page-shared layout primitives and small widgets used across every routed options page. They define the visual grammar of the settings UI: the page chrome (`PageLayout`), the two-column "label + control" config row (`ConfigCard`), the master/detail editor shell (`EntityEditorLayout` + `EntityListRail`), the dashboard metric tile (`MetricCard`), the URL-pattern editor (`PatternsTable`), and the inline "set your API key" warning (`SetApiKeyWarning`). Pages compose these instead of inventing their own layouts.

## Key Files

| File                       | Description                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `page-layout.tsx`          | Top-level shell each page mounts: a `Container`-wrapped sticky header (`SidebarTrigger` + vertical separator + `<h1>{title}</h1>`) plus a `Container`+`@container` body that takes `children` and `innerClassName`.                                |
| `config-card.tsx`          | Two-column row used inside `PageLayout` — left column (`lg:basis-2/5`) holds title + muted description, right column (`lg:basis-3/5`) holds the actual control(s). The `id` prop is the deep-link target for the command palette's section scroll. |
| `entity-editor-layout.tsx` | Master/detail flex layout — `list` slot (`w-40 lg:w-52`, vertical) on the left, `editor` slot (flex-1) on the right. Used by Custom Actions and API Providers pages.                                                                               |
| `entity-list-rail.tsx`     | Scrollable rail for the master column — shows up/down `tabler:chevron-*` fade indicators using `ResizeObserver` + scroll listeners; hides scrollbars; clamps to `max-h-[720px]`.                                                                   |
| `metric-card.tsx`          | Statistics tile with icon, title, big number (formatted by `addThousandsSeparator`), and optional `comparison` percentage shown as up/down/flat with colored arrow icons. Uses React 19 `<Activity mode="visible                                   | hidden">` for the three comparison branches so all three render but only one is visible. |
| `patterns-table.tsx`       | Add/remove URL pattern editor — `Input` + `+` button (also Enter-to-add) feeding `onAddPattern`, plus a `Table` of existing patterns with per-row delete. Used by floating-button / selection-toolbar disabled-sites editors.                      |
| `set-api-key-warning.tsx`  | Yellow warning banner with an inline `Link` to `/api-providers`, shown by feature pages when no API key is configured.                                                                                                                             |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- `ConfigCard`'s `id` prop must match the `sectionId` declared in `command-palette/search-items.ts`. When adding a new searchable section, set the `id` here AND register the search item.
- `PageLayout`'s `innerClassName` is the standard hook for per-page spacing (e.g. `*:border-b [&>*:last-child]:border-b-0` for between-section dividers, or `flex flex-col p-8 gap-8` for the statistics dashboard).
- `EntityListRail` measures via `ResizeObserver` plus a `setTimeout` after children change — do not replace with `IntersectionObserver`; the chevron fade depends on `scrollHeight > clientHeight`, not visibility.
- `MetricCard` uses React 19 `<Activity>` instead of conditional rendering so layout shift is avoided when comparison flips sign — preserve that pattern.
- `PatternsTable` is purely controlled; persistence happens in the page that owns the patterns array. Do not add internal storage here.
- `SetApiKeyWarning` always links to `/api-providers` — that path lives in `app-sidebar/nav-items.ts` and must stay.

### Testing Requirements

`pnpm test` (Vitest). No tests are co-located here today; layout primitives are exercised via page-level tests under `pages/**/__tests__/`. Not affected by `SKIP_FREE_API`.

### Common Patterns

- Most components accept a `className` (and sometimes `containerClassName` / `innerClassName` / `listClassName`) merged via `cn` from `@/utils/styles/utils`. Follow this convention when adding new primitives.
- Visual chrome belongs here; data fetching belongs on the page. None of these primitives reads atoms or queries.

## Dependencies

### Internal

- `@/components/container`, `@/components/ui/base-ui/separator`, `@/components/ui/base-ui/sidebar` (`SidebarTrigger`)
- `@/components/ui/base-ui/card`, `@/components/ui/base-ui/button`, `@/components/ui/base-ui/input`, `@/components/ui/base-ui/table`
- `@/utils/styles/utils` (`cn`), `@/utils/utils` (`addThousandsSeparator`, `numberToPercentage`)

### External

- `react` 19 (`Activity`, `useLayoutEffect`, `ResizeObserver` API), `react-router` (`Link`)
- `@iconify/react`, `@tabler/icons-react`
- `#imports` (`i18n`)

<!-- MANUAL: -->
