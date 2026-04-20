<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# entrypoints

## Purpose

WXT auto-discovers each subfolder/file here as a separate browser-extension entrypoint and emits the corresponding manifest entry, build artifact, and HTML/JS bundle. Each `*.content/` directory compiles to a content script with its own `defineContentScript({ matches, runAt, world, main })` config; `background/` is the MV3 service worker; `popup/` and `options/` are extension UI pages; `offscreen/` is a Chrome-only offscreen document for audio playback (the `offscreen` permission is conditionally added in `wxt.config.ts` for non-Firefox builds); and `translation-hub/` is a standalone HTML page opened in its own tab as a multi-provider translation workbench.

## Key Files

This directory has no top-level files — only subdirectories.

## Subdirectories

| Directory              | Purpose                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `background/`          | MV3 service worker that hosts queues, AI streams, context menu, alarms, proxy fetch, TTS, iframe injection (see `background/AGENTS.md`)  |
| `guide.content/`       | Content script injected only on the official Read Frog website to bridge in-page UI with the extension (see `guide.content/AGENTS.md`)   |
| `host.content/`        | Main per-page host content script (translation manager, side panel mount, message routing)                                               |
| `interceptor.content/` | YouTube `MAIN`-world script that taps the `<html5-video-player>` API and observes `timedtext` URLs (see `interceptor.content/AGENTS.md`) |
| `offscreen/`           | Chrome-only offscreen document that plays synthesized TTS audio outside the service worker (see `offscreen/AGENTS.md`)                   |
| `options/`             | Options page (React app for settings, providers, prompts, backups)                                                                       |
| `popup/`               | Toolbar popup (React app for quick toggles and status)                                                                                   |
| `selection.content/`   | Selection-toolbar content script (translate selected text, custom actions)                                                               |
| `side.content/`        | Side-panel content script with the in-page React UI (Shadow DOM)                                                                         |
| `subtitles.content/`   | Video subtitle overlay/translation content script (YouTube and friends)                                                                  |
| `translation-hub/`     | Standalone HTML page running multi-provider translation cards (see `translation-hub/AGENTS.md`)                                          |

## For AI Agents

### Working In This Directory

- WXT detects entrypoints by file/folder name only — adding a new content script means creating `xxx.content/index.ts` (or `xxx.content.ts`) that `export default defineContentScript({...})`.
- Auto-imports are disabled (`imports: false` in `wxt.config.ts`); always import `defineBackground`, `defineContentScript`, `browser`, `storage`, `i18n` explicitly from `#imports`.
- Content scripts must declare `matches` (URL patterns from `@/utils/constants/url`) and may declare `world: "MAIN"` (e.g. `interceptor.content`) for page-context access — `MAIN`-world scripts cannot use `browser.*` APIs.
- Every entrypoint runs in its own JS context: cross-context state must go through `@/utils/message` (typed via `@webext-core/messaging`), `browser.runtime.connect` (long-lived ports for streaming, see `background-stream.ts`), or WXT `storage`/Dexie.
- Programmatic injection in `background/iframe-injection.ts` re-injects `host.js`/`selection.js` into iframes that Chrome's manifest `all_frames: true` misses (sandboxed/dynamic iframes); when adding a new in-iframe script, register it there too.
- `wxt.config.ts` toggles the `offscreen` permission per browser — Firefox MV3 lacks offscreen, so any feature relying on it must degrade gracefully (see `background/tts-playback.ts` and `offscreen/main.ts`).

### Testing Requirements

Run `pnpm test` (Vitest). Each subfolder co-locates Vitest specs in `__tests__/` (e.g. `background/__tests__/*.test.ts`). Tests touching live AI/translation networks honour the `SKIP_FREE_API=true` env to skip them in CI.

### Common Patterns

- Background entry: `defineBackground({ type: "module", main: () => { /* register all handlers synchronously */ } })`.
- Content entry: `defineContentScript({ matches, runAt?, world?, async main(ctx) { /* register message handlers, mount React via createShadowRootUi */ } })`.
- Page entry (`translation-hub`, `popup`, `options`): `index.html` + `main.tsx` that boots a React tree wrapped in `JotaiProvider` + `QueryClientProvider` + `ThemeProvider`, hydrating atoms with `useHydrateAtoms`.
- Cross-frame communication uses `window.postMessage` between `interceptor.content` (MAIN world) and `subtitles.content` (ISOLATED world).

## Dependencies

### Internal

- `@/utils/message` — typed `onMessage`/`sendMessage` shared by all entrypoints.
- `@/utils/atoms/*`, `@/utils/config/*`, `@/utils/db/dexie/db` — shared state/persistence.
- `@/utils/host/translate/*`, `@/utils/prompts/*`, `@/utils/providers/*` — translation pipeline reused across background queues, side panel, and translation hub.
- `@/utils/react-root`, `@/utils/react-shadow-host/*` — React mounting helpers used by every UI entrypoint.

### External

- `wxt` / `#imports` — entrypoint definitions (`defineBackground`, `defineContentScript`), `browser` polyfill, `storage`, `i18n`.
- `@webext-core/messaging` — type-safe RPC underlying `@/utils/message`.
- `ai` + `@ai-sdk/*` — model streaming used in background and renderer entrypoints.
- `jotai`, `@tanstack/react-query`, `react` (19) — UI state for HTML page entrypoints.

<!-- MANUAL: -->
