<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# src

## Purpose

The single source root for the Read Frog browser extension (configured via `srcDir: "src"` in `wxt.config.ts`). Contains every WXT entrypoint, every reusable React component, every utility module, hooks, types, locales, and in-source assets that ship with the extension.

## Key Files

This directory has **no top-level files** — only subdirectories. All code lives one level deeper.

## Subdirectories

| Directory      | Purpose                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entrypoints/` | All WXT entrypoints: background service worker, popup, options page, content scripts (selection, host, side, subtitles, guide, interceptor), offscreen document, translation hub. The shape of these directories is dictated by WXT (see `entrypoints/AGENTS.md`). |
| `components/`  | Reusable React components shared across multiple entrypoints, including the shadcn/ui primitives (see `components/AGENTS.md`).                                                                                                                                     |
| `utils/`       | All non-component logic: config schema/migrations, AI provider adapters, translation engines, subtitle pipeline, DB layer, messaging, oRPC client, atoms, etc. (see `utils/AGENTS.md`).                                                                            |
| `hooks/`       | Cross-cutting React hooks (see `hooks/AGENTS.md`).                                                                                                                                                                                                                 |
| `types/`       | Zod schemas + TypeScript types that are imported across entrypoints (see `types/AGENTS.md`).                                                                                                                                                                       |
| `locales/`     | i18n message catalogs consumed by `@wxt-dev/i18n` (see `locales/AGENTS.md`).                                                                                                                                                                                       |
| `assets/`      | In-source images, icons, styles bundled with the extension (distinct from repo-level `/assets/`) (see `assets/AGENTS.md`).                                                                                                                                         |

## For AI Agents

### Working In This Directory

- **Auto-imports are OFF.** WXT config sets `imports: false`. Always write explicit `import` statements. Do not assume any global helpers.
- **Path alias `@/*` → `src/*`** is set up by WXT and synced into `tsconfig.json` automatically.
- **JSX is `react-jsx`** (no need to `import React`).
- **React 19** — use modern patterns (e.g. `use()` hook, transitions, server-component-friendly composition where it makes sense). Do not introduce `<React.StrictMode>` wrappers in content scripts; many features depend on single-mount behavior.
- **Multiple execution contexts.** Code in this tree may run in: extension background service worker, popup window, options page tab, content script (DOM-isolated), or offscreen document. Each has different APIs available — verify before using `window`, `document`, `chrome.tabs`, etc.
- Do not import directly across entrypoints (e.g. popup importing from `entrypoints/options`). Move shared code to `components/`, `utils/`, `hooks/`, or `types/`.

### Testing Requirements

- Vitest specs live in `__tests__/` folders co-located with source.
- Tests run in node env with WXT's testing helpers (see root `vitest.config.ts`).
- Set `SKIP_FREE_API=true` to skip live-network tests.

### Common Patterns

- **State**: Jotai. Atom factories live in `utils/atoms/`. Hooks/components subscribe via `useAtom`/`useAtomValue`.
- **Persistence**: Dexie tables in `utils/db/dexie/` for translation cache, custom prompts, history, etc.; WXT storage helpers for config snapshots.
- **Cross-context messaging**: `utils/message.ts` (typed `@webext-core/messaging` definition + handlers).
- **AI requests**: `utils/ai-request.ts` + `utils/providers/` build a Vercel AI SDK model from saved provider config and call it with retries/batching (`utils/batch-request-record.ts`).
- **Shadow DOM UIs**: Content scripts mount React inside a Shadow Root via `utils/react-shadow-host/` to isolate Tailwind styles from host pages.
- **Config**: Single source of truth schema in `utils/config/`, migrated forward via `utils/config/migration-scripts/`.

## Dependencies

### Internal

- Re-exports nothing at this level — each subdirectory is its own surface.

### External

See root `AGENTS.md` for the full external dependency list. The most-used in `src/` are: `react`, `jotai`, `ai`, `@ai-sdk/*`, `@wxt-dev/i18n`, `@webext-core/messaging`, `dexie`, `zod`, `tailwindcss`.

<!-- MANUAL: -->
