<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# pages

## Purpose

One subdirectory per routed options page. Each subdirectory exports a named `<XxxPage />` (e.g. `GeneralPage`, `ApiProvidersPage`) that is lazy-imported by `options/app.tsx` and registered in `app-sidebar/nav-items.ts`. Pages always wrap their content in `<PageLayout title={…}>` and compose `ConfigCard` rows (or larger primitives like `EntityEditorLayout`) for individual settings. Most pages are pure config UI bound to `configFieldsAtomMap.<field>`; a few host their own complex sub-features (api-providers form, custom-actions editor, statistics charts, config import/export with Google Drive sync).

This directory has no top-level files — only subdirectories.

## Subdirectories

| Directory            | Purpose                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `general/`           | Landing page — `FeatureProvidersConfig`, `LanguageDetectionConfig`, `SiteControlMode`, `AppearanceSettings`.                                                                                                                               |
| `api-providers/`     | Provider catalog with master/detail editor — `ProvidersConfig` plus a multi-field `provider-config-form/` subtree (api-key, base-url, model selector, options, temperature, connection test).                                              |
| `custom-actions/`    | Selection-toolbar custom-action editor — `action-config-form/` (name, icon, output schema, provider, optional notebase connection) + master/detail list.                                                                                   |
| `translation/`       | Page-translation tuning (mode, range, shortcut, hotkey, style, AI content-aware, personalized prompts, auto-translate, request-rate / batch / preload, small-paragraph filter, cache clear).                                               |
| `video-subtitles/`   | YouTube subtitle settings — style, custom prompts, request rate, batch, AI segmentation cache.                                                                                                                                             |
| `floating-button/`   | `floating-button-global-toggle.tsx`, `floating-button-click-action.tsx`, `floating-button-disabled-sites.tsx` (uses `PatternsTable`).                                                                                                      |
| `selection-toolbar/` | `selection-toolbar-global-toggle.tsx`, `selection-toolbar-feature-toggles.tsx`, `selection-toolbar-opacity.tsx`, `selection-toolbar-disabled-sites.tsx`.                                                                                   |
| `context-menu/`      | `context-menu-translate-toggle.tsx`.                                                                                                                                                                                                       |
| `input-translation/` | Input-field translation — toggle, threshold, language list.                                                                                                                                                                                |
| `text-to-speech/`    | TTS settings (excluded from routing on Firefox via `nav-items.ts`).                                                                                                                                                                        |
| `statistics/`        | Dashboard built from `MetricCard` plus `charts/batch-request-record/` (chart + metrics + aside, with its own atom).                                                                                                                        |
| `config/`            | Config management — `about-card`, `beta-experience`, `manual-config-sync`, `reset-config`, `config-backup/`, `google-drive-sync/` (with `unresolved-dialog` + `json-tree-view` for conflict resolution), and `components/view-config.tsx`. |

## For AI Agents

### Working In This Directory

- A new page requires three coordinated edits: (1) create `pages/<name>/index.tsx` exporting `<NameP age />`, (2) add `{ path: "/<name>" }` to `ROUTE_DEFS` in `../app-sidebar/nav-items.ts`, (3) add `lazy(() => import("./pages/<name>").then(m => ({ default: m.<Name>Page })))` plus a `ROUTE_COMPONENTS["/<name>"]` entry in `../app.tsx`. Adding a sidebar menu entry in `settings-nav.tsx` is also required if it should be navigable.
- Pages must wrap content in `<PageLayout title={i18n.t("...")}>` — never render their own page-level header. Use `innerClassName="*:border-b [&>*:last-child]:border-b-0"` for the standard between-section divider.
- Each `ConfigCard` should set an `id` matching a `sectionId` in `command-palette/search-items.ts` if it is meant to be deep-linkable from the palette.
- Persisted writes go through `configFieldsAtomMap.<field>` (`useAtom` / `useSetAtom`). Use `deepmerge` from `deepmerge-ts` when patching nested config slices.
- Pages that depend on an LLM API key should render `<SetApiKeyWarning />` instead of silently failing. The provider-config form's connection-test button at `api-providers/provider-config-form/components/connection-button.tsx` is the canonical example of live-API gating.
- Page-local atoms (e.g. `api-providers/atoms.ts`, `custom-actions/atoms.ts`, `statistics/charts/batch-request-record/atom.ts`) live alongside the page — do not promote them to `@/utils/atoms` unless reused.
- Firefox-only gating: `tts` is the only currently-gated route. If you add another, gate it in **both** `nav-items.ts` and `command-palette/search-items.ts`.

### Testing Requirements

`pnpm test` (Vitest + Testing Library). Many pages have co-located `__tests__/` (e.g. `api-providers/provider-config-form/__tests__/`, `custom-actions/action-config-form/__tests__/beta-gating.test.tsx`). Tests that exercise the `connection-button` flow can hit the upstream provider — set `SKIP_FREE_API=true` to skip live-network tests; CI uses this.

### Common Patterns

- Page entry shape: `import { i18n } from "#imports"; import { PageLayout } from "../../components/page-layout"; export function XxxPage() { return <PageLayout title={i18n.t("…")} innerClassName="…">…</PageLayout> }`.
- Master/detail pages (api-providers, custom-actions): `EntityEditorLayout` + `EntityListRail` for the rail, with selection state in a page-local atom; the right pane renders the form module.
- Form pages (provider-config-form, action-config-form): factor each field into its own file (`api-key-field.tsx`, `name-field.tsx`, etc.) and an aggregate `index.tsx` + `form.ts` (Zod schema + helpers). Validation is via Zod.
- Statistics: chart implementation lives under `charts/<name>/` with its own `atom.ts`, `chart.tsx`, `metrics.tsx`, `aside.tsx`, and a barrel `charts/index.ts`.

## Dependencies

### Internal

- `../components/page-layout`, `../components/config-card`, `../components/entity-editor-layout`, `../components/entity-list-rail`, `../components/metric-card`, `../components/patterns-table`, `../components/set-api-key-warning`
- `@/utils/atoms/config`, `@/utils/atoms/provider`, `@/utils/config/helpers`, `@/utils/config/storage`
- `@/utils/ai-request`, `@/utils/providers/*` (provider connection tests)
- `@/utils/orpc/*` (Notebase connection in custom actions; Google Drive sync in config)
- `@/utils/message` (cross-context calls to background)
- `@/components/ui/base-ui/*`, `@/components/help-tooltip`, `@/components/llm-providers/*`

### External

- `react-router` 7 (`Link`), `jotai`, `@tanstack/react-query`
- `zod` + `@/utils/zod-config` (form schemas), `deepmerge-ts`
- `@iconify/react`, `@tabler/icons-react`
- `recharts` (statistics charts, transitively)
- `#imports` (`browser`, `i18n`), `#i18n`

<!-- MANUAL: -->
