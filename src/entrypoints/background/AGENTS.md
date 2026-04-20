<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# background

## Purpose

Implements the MV3 service worker exported by `index.ts` via `defineBackground({ type: "module" })`. The `main()` function wires up every cross-cutting feature the extension needs at the privileged level: config bootstrap, periodic alarms (cache cleanup + config backup), the two translation queues (web page + subtitles), AI streaming over long-lived `runtime.Port`s, context-menu lifecycle, proxy `fetch` for content scripts, Edge TTS synthesis, offscreen TTS playback orchestration, programmatic content-script injection into missed iframes, analytics relay (PostHog), and the install/update flow (open tutorial, clear blog cache, register uninstall survey URL).

## Key Files

| File                        | Description                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                  | `defineBackground` entry — installs message handlers, alarms, port listeners, and bootstraps every module synchronously inside `main()` so MV3 wakeups don't lose listeners.                                                                          |
| `config.ts`                 | `ensureInitializedConfig()` — promise-cached `initializeConfig` call returning the persisted `Config`; used by every other module to avoid races.                                                                                                     |
| `config-backup.ts`          | Periodic alarm (`config-backup`) that snapshots the current config into the Dexie `backup` table when it differs from the latest.                                                                                                                     |
| `translation-queues.ts`     | Builds two independent `RequestQueue` + `BatchQueue` pipelines (web page + subtitles) with `executeTranslate`, hash-keyed Dexie cache (`translationCache`), summary cache (`articleSummaryCache`), and live queue-config reconfiguration messages.    |
| `translation-signal.ts`     | Per-tab translation enable/disable state machine — stores `{enabled}` per tab in `session:` storage, fans out `notifyTranslationStateChanged`, handles `checkAndAskAutoPageTranslation`, and clears state on tab/navigation.                          |
| `background-stream.ts`      | Long-lived port handlers (`streamText`, `streamStructuredObject`) that stream Vercel AI SDK results back to UI contexts with abort + thinking snapshots; payload validated with Zod.                                                                  |
| `ai-segmentation.ts`        | `runAiSegmentSubtitles` — calls `generateText` with `getSubtitlesSegmentationPrompt`, cleans VTT output, caches into `aiSegmentationCache`.                                                                                                           |
| `llm-generate-text.ts`      | `backgroundGenerateText` message handler — non-streaming `generateText` proxy keyed by `providerId`.                                                                                                                                                  |
| `proxy-fetch.ts`            | `backgroundFetch` handler — runs cross-origin `fetch` with optional session cache (via `SessionCacheGroupRegistry`), invalidates cache on auth-cookie changes for `AUTH_DOMAINS`/`AUTH_COOKIE_PATTERNS`.                                              |
| `context-menu.ts`           | Sync registration of `contextMenus`/`tabs`/`storage.session` listeners; rebuilds menu items on config/tab/storage changes; handles translate, selection translate, and per-action selection custom-action clicks.                                     |
| `db-cleanup.ts`             | Three periodic alarms (`cache-cleanup`, `request-record-cleanup`, `summary-cache-cleanup`) plus exported `cleanupAll*` helpers for manual purges.                                                                                                     |
| `iframe-injection.ts`       | Watches `webNavigation.onCompleted` for non-main frames and re-injects `/content-scripts/host.js` + `/content-scripts/selection.js` via `scripting.executeScript` when manifest `all_frames` misses them; deduplicates by `tabId:frameId:documentId`. |
| `iframe-injection-utils.ts` | `resolveSiteControlUrl` — walks parent frames to find the nearest http(s)/file URL used as the site-control identity for iframe injections.                                                                                                           |
| `edge-tts.ts`               | Bridges `edgeTtsSynthesize`/`edgeTtsListVoices`/`edgeTtsHealthCheck` messages to `@/utils/server/edge-tts` and Base64-encodes the audio for the message channel.                                                                                      |
| `tts-playback.ts`           | Manages the Chrome offscreen document lifecycle (`createDocument`, `getContexts`) and forwards `ttsPlaybackStart`/`ttsPlaybackStop` to it; retries once on missing-receiver errors.                                                                   |
| `analytics.ts`              | PostHog client factory bound to `WXT_POSTHOG_*` env, persists install ID in `local:` storage, filters captured properties to a strict allowlist, exposes `trackFeatureUsedEvent` message handler.                                                     |
| `new-user-guide.ts`         | Polls `browser.action.getUserSettings()` (or listens to `onUserSettingsChanged`) and broadcasts `pinStateChanged` to tabs on `OFFICIAL_SITE_URL_PATTERNS`.                                                                                            |
| `uninstall-survey.ts`       | Builds a per-user uninstall URL with version/browser/os/locale query params and calls `runtime.setUninstallURL`.                                                                                                                                      |
| `mock-data.ts`              | Dev-only seeding (gated by `import.meta.env.DEV && WXT_MOCK_DATA === "true"`) populating `batchRequestRecord`.                                                                                                                                        |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- All listeners must be registered synchronously inside `defineBackground.main()` — MV3 service workers can be torn down and revived; lazy `await` before `addListener` will lose events. See how `registerContextMenuListeners()` is called sync while `initializeContextMenu()` is fired with `void`.
- Use `ensureInitializedConfig()` (promise-cached) instead of calling `initializeConfig()` directly to avoid duplicate writes when multiple modules boot in parallel.
- Long-lived streams use `runtime.onConnect` ports, not `onMessage` — see `dispatchBackgroundStreamPort` and the `BACKGROUND_STREAM_PORTS` map. Add new stream kinds by extending `BACKGROUND_STREAM_PORT_HANDLERS`.
- Messages delivered to the background must be declared in `@/utils/message` (typed via `@webext-core/messaging`); the handlers here are the source of truth for that contract.
- `proxy-fetch.ts` invalidates session caches on auth cookie changes — when adding new authenticated providers, extend `AUTH_DOMAINS`/`AUTH_COOKIE_PATTERNS` in `@read-frog/definitions` rather than special-casing here.
- Dexie tables touched: `translationCache`, `articleSummaryCache`, `aiSegmentationCache`, `batchRequestRecord` — keep cleanup logic in `db-cleanup.ts` (alarm-driven) when adding new caches.
- The offscreen document is Chrome-only; guard any new offscreen feature behind a feature check or a `browser !== "firefox"` branch (the `offscreen` permission is also gated in `wxt.config.ts`).

### Testing Requirements

Run `pnpm test` (Vitest). Specs live under `__tests__/` (e.g. `__tests__/translation-queues.test.ts`, `__tests__/proxy-fetch.test.ts`, `__tests__/iframe-injection.test.ts`). Several tests exercise live providers and respect `SKIP_FREE_API=true` to skip in CI.

### Common Patterns

- Module exports a `setUpXxx()`/`setupXxxMessageHandlers()` function that `index.ts` invokes inside `main()`.
- Message handlers wrap business logic in try/catch and re-throw via `logger.error(...)` so the message channel sees the error.
- Translation cache key is `Sha256Hex(text + langConfig + providerConfig)`; both queues check `db.translationCache.get(hash)` before enqueueing.
- Stream ports use a Zod-validated `start` envelope, then post `{type: "chunk" | "done" | "error", data, requestId}` until disconnect.

## Dependencies

### Internal

- `@/utils/message`, `@/utils/logger`, `@/utils/zod-config` (side-effect import that registers Zod error map).
- `@/utils/db/dexie/db` — Dexie schema for translation/summary/segmentation caches and batch records.
- `@/utils/config/init` + `@/utils/config/storage` + `@/utils/constants/config` — config bootstrap + storage key.
- `@/utils/host/translate/*`, `@/utils/prompts/*`, `@/utils/providers/*`, `@/utils/request/{request-queue,batch-queue}` — translation execution stack.
- `@/utils/session-cache/session-cache-group-registry` — TTL-based session cache used by `proxy-fetch.ts`.
- `@/utils/server/edge-tts`, `@/utils/backup/storage`, `@/utils/site-control`, `@/utils/analytics`.

### External

- `ai` (Vercel AI SDK) — `streamText`, `generateText`, `Output.object` for structured streaming.
- `zod` — runtime validation of port payloads.
- `posthog-js/dist/module.no-external` — bundle-friendly PostHog build for service workers.
- `@read-frog/definitions` — auth domain/cookie constants and shared types.
- `#imports` (`browser`, `storage`, `i18n`, `defineBackground`) provided by WXT.

<!-- MANUAL: -->
