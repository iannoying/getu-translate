<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# command-palette

## Purpose

A cmdk-powered global search palette opened from the sidebar input or via Cmd/Ctrl+K. Displays a flat catalog of "settings sections" grouped by their owning page (`pageKey`); selecting an item navigates via `react-router` to `route?section=<sectionId>` and the destination page scrolls the matching `id="..."` element into view (waiting for it to mount when lazily rendered).

## Key Files

| File                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atoms.ts`            | One Jotai atom — `commandPaletteOpenAtom` (boolean) — shared between the sidebar trigger and `SettingsSearch`.                                                                                                                                                                                                                                                                                                                                           |
| `search-items.ts`     | The `SEARCH_ITEMS` catalog — typed `SearchItem[]` with `sectionId`, `route`, `titleKey`, optional `descriptionKey`, `pageKey`. Items are validated `satisfies SearchItemDefinition[]` against `GeneratedI18nStructure` from `#i18n` so all keys must exist in `src/locales/`. Conditionally includes TTS / Config items based on `IS_FIREFOX`.                                                                                                           |
| `section-scroll.ts`   | URL plumbing for deep-linking into a section: `SECTION_QUERY_PARAM = "section"`, `buildSectionSearch(id)`, `getSectionIdFromSearch(search)`, and `scrollToSectionWhenReady(id)` (uses `waitForElement` from `@/utils/dom/wait-for-element` to handle lazy-rendered targets, with `CSS.escape` fallback).                                                                                                                                                 |
| `settings-search.tsx` | The `<SettingsSearch />` dialog — listens for Cmd/Ctrl+K, groups `SEARCH_ITEMS` by `pageKey`, renders `CommandDialog`/`CommandInput`/`CommandGroup`/`CommandItem`. On select, navigates to `{ pathname: route, search: buildSectionSearch(sectionId) }`; if already on the same path+search, scrolls instead. A `useEffect` on `[locationKey, search]` triggers `scrollToSectionWhenReady` whenever the URL contains a section param (deduped by a ref). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Every `SearchItem` corresponds to a real `id="..."` somewhere in the destination page (typically on a `ConfigCard`'s `<section>`). When adding a new item, add the matching `id` on the page or the scroll-to will silently no-op after the `waitForElement` timeout.
- `titleKey` / `descriptionKey` / `pageKey` must exist in `src/locales/<lang>/` because `SearchItemDefinition` constrains them to `keyof GeneratedI18nStructure`. The TS error surfaces at edit time — fix locales rather than casting.
- The Firefox split (`!IS_FIREFOX` for TTS) mirrors the same gating in `app-sidebar/nav-items.ts` and `app-sidebar/settings-nav.tsx`. Keep all three in sync.
- Section-scroll uses `CSS.escape` when available and a manual `[id="..."]` selector fallback — do not assume `id` strings are CSS-safe.
- The deep-link effect uses `locationKey` (not just `search`) to debounce, so navigating to the same `?section=foo` twice in a row still re-scrolls.

### Testing Requirements

`pnpm test` (Vitest). Co-located tests: `__tests__/section-scroll.test.ts` (URL helpers + scroll behavior) and `__tests__/settings-search-navigation.test.tsx` (palette → navigate → scroll round-trip with mocked router). Not affected by `SKIP_FREE_API`.

### Common Patterns

- `value` of each `<CommandItem>` is built by `buildSearchValue(item)` which concatenates the translated title and (optional) description — that is what cmdk fuzz-matches against, so descriptions effectively widen the searchable surface.
- Grouping uses a `Map<pageKey, items[]>` so iteration order matches first-encounter order in `SEARCH_ITEMS`.

## Dependencies

### Internal

- `@/components/ui/base-ui/command` (cmdk-wrapped `CommandDialog` / `CommandInput` / `CommandList` / `CommandGroup` / `CommandItem` / `CommandEmpty`)
- `@/utils/dom/wait-for-element`
- `#i18n` (generated `GeneratedI18nStructure` keys), `#imports` (`i18n`)

### External

- `cmdk` (transitively, via `@/components/ui/base-ui/command`)
- `react-router` 7 (`useLocation`, `useNavigate`)
- `jotai`

<!-- MANUAL: -->
