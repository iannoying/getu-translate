<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# utils

## Purpose

The non-component logic surface for Read Frog: state atoms, AI/translation pipelines, cross-context messaging, oRPC client, storage adapters, prompt templates, request queues, DOM/shadow helpers, theme handling, analytics, and small utility helpers. Modules here are imported by every entrypoint (background, popup, options, content scripts, offscreen) and are the canonical place for any logic that does not live inside a React component or a WXT entrypoint.

## Key Files (grouped by topic)

### AI, translation & request orchestration

| File                      | Description                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ai-request.ts`           | `sendInBatchesWithFixedDelay` — batch promise scheduler used by translation pipelines (calls Vercel AI SDK in fixed-size waves). |
| `batch-request-record.ts` | Dexie-backed batch-request audit (`putBatchRequestRecord`, range queries) used to compute "API calls saved" stats on the popup.  |

### Cross-context messaging

| File         | Description                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message.ts` | The single `defineExtensionMessaging<ProtocolMap>()` declaration (`@webext-core/messaging`). Every typed `sendMessage`/`onMessage` call across contexts goes through this `ProtocolMap`. |
| `http.ts`    | `normalizeHeaders(HeadersInit)` helper used by `backgroundFetch` proxy paths (`auth/`, `orpc/`).                                                                                         |

### Logging / analytics / debug

| File           | Description                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `logger.ts`    | DEV-only `[dev-log]` logger (`log/info/warn/error`) — no-ops in production. The de-facto logging API.            |
| `analytics.ts` | `trackFeatureUsed`, `trackFeatureAttempt`, latency helpers — sends `feature_used` events through the background. |
| `debug.ts`     | `printNodeStructure(Node)` debug helper for content-script DOM inspection.                                       |

### DOM / shadow / styles

| File             | Description                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-root.ts`  | `renderPersistentReactRoot` / `unmountPersistentReactRoot` with a `globalThis` `WeakMap<container, Root>` registry that survives HMR.                 |
| `shadow-root.ts` | `insertShadowRootUIWrapperInto` — inserts a `text-base antialiased font-sans … notranslate` wrapper at z-index `2147483647`.                          |
| `styles.ts`      | `addStyleToShadow`, `mirrorDynamicStyles`, `protectInternalStyles` — bridges sonner / `_goober` / WXT shadow-root styles between document and shadow. |
| `select-all.ts`  | `protectSelectAllShadowRoot` — Ctrl/Cmd+A handler that scopes selection inside a shadow host or excludes it from full-page select.                    |
| `theme.ts`       | `isDarkMode`, `applyTheme`, `getLocalThemeMode` — applies theme classes + `color-scheme` to a target element.                                         |

### Site & shortcut control

| File                           | Description                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `site-control.ts`              | `isSiteEnabled` (whitelist/blacklist matching), plus `__READ_FROG_SITE_CONTROL_URL__` plumbing for blank/srcdoc iframes. |
| `page-translation-shortcut.ts` | Hotkey normalize/format/parse around `@tanstack/hotkeys` for the configurable page-translation shortcut.                 |
| `os.ts`                        | `formatHotkey`, `getCommandPaletteShortcutHint` — OS detection (Windows/MacOS/Linux/iOS/Android) for hotkey display.     |

### URL & misc helpers

| File                               | Description                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `url.ts`                           | `matchDomainPattern(url, pattern)` — Zod-validated hostname-suffix matcher.                                                                                 |
| `utils.ts`                         | Generic helpers: `isNonNullish`, `getActiveTabUrl`, `ensureKeyInMap`, `addThousandsSeparator`, `numberToPercentage`, `getDateFromDaysBack`, `getReviewUrl`. |
| `name.ts`                          | `getUniqueName(base, existingNames)` — appends incrementing suffix until unique.                                                                            |
| `hash.ts`                          | `Sha256Hex(...texts)` — joined-with-`                                                                                                                       | `SHA256 (used as a stable cache key by`react-shadow-host` and request queues). |
| `crypto-polyfill.ts`               | `getRandomUUID` / `generateUUIDv4` — fallback for environments without `crypto.randomUUID`.                                                                 |
| `logo.ts`                          | `getLobeIconsCDNUrlFn(slug)` — registry.npmmirror Lobe icon URL builder, themed.                                                                            |
| `notebase.ts` / `notebase-beta.ts` | Custom-action ↔ Notebase column mapping helpers + `useNotebaseBetaStatus` query (oRPC).                                                                     |
| `blog.ts`                          | Latest-blog-post fetch + Bilibili embed/url helpers used by the popup blog widget.                                                                          |
| `survey.ts`                        | `saveLastViewedSurvey` / `hasNewSurvey` — survey-banner state persisted in WXT storage.                                                                     |
| `tanstack-query.ts`                | Singleton `QueryClient` with toast-on-error (respects `meta.suppressToast`).                                                                                |
| `zod-config.ts`                    | One-line `z.config({ jitless: true })` so Zod skips `new Function` (CSP-safe in MV3). Import early.                                                         |

## Subdirectories

| Directory            | Purpose                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `atoms/`             | Jotai atom factories for config, theme, providers, analytics, sync conflicts, etc. (see `atoms/AGENTS.md`)                        |
| `auth/`              | better-auth React client wired through the background fetch proxy (see `auth/AGENTS.md`)                                          |
| `backup/`            | Config backup history persisted in WXT storage (see `backup/AGENTS.md`)                                                           |
| `config/`            | Config schema lookups, migration runner, local/sync storage adapters (see `config/AGENTS.md`)                                     |
| `constants/`         | All app-wide constants and default values (see `constants/AGENTS.md`)                                                             |
| `content/`           | Article extraction, language detection, summary generation for the active page (see `content/AGENTS.md`)                          |
| `content-script/`    | Content-script-side wrappers around background services (proxy fetch, port streams, asset blobs) (see `content-script/AGENTS.md`) |
| `css/`               | css-tree based CSS linter for the CodeMirror prompt/style editors (see `css/AGENTS.md`)                                           |
| `db/`                | Dexie schema + migrations + table classes (translation cache, custom prompts, history, batch-request audit).                      |
| `dom/`               | Generic DOM helpers shared by content scripts (see `dom/AGENTS.md`)                                                               |
| `error/`             | Error message extraction/normalization helpers (see `error/AGENTS.md`)                                                            |
| `google-drive/`      | Google Drive AppData OAuth + sync engine (see `google-drive/AGENTS.md`)                                                           |
| `host/`              | Host-page DOM walking / mutation pipeline used by the bilingual translator entrypoint.                                            |
| `iconify/`           | Lazy iconify fetch redirected through background (see `iconify/AGENTS.md`)                                                        |
| `orpc/`              | oRPC client over the background fetch proxy (see `orpc/AGENTS.md`)                                                                |
| `prompts/`           | Built-in prompt builders + token replacement for translate / explain / analyze / subtitles (see `prompts/AGENTS.md`)              |
| `providers/`         | Vercel AI SDK provider adapters (model resolution, provider options).                                                             |
| `react-shadow-host/` | Mounts React inside a Shadow Root with Tailwind isolation (see `react-shadow-host/AGENTS.md`)                                     |
| `request/`           | Token-bucket request queue, batch queue, binary-heap PQ used by translation (see `request/AGENTS.md`)                             |
| `server/`            | Background-only services (e.g. Edge TTS) callable through `message.ts`.                                                           |
| `session-cache/`     | `session:` storage-backed grouped HTTP response cache (see `session-cache/AGENTS.md`)                                             |
| `styles/`            | Tailwind `cn()` + the PostCSS plugin that prefixes `--tw-*` to `--rf-tw-*` (see `styles/AGENTS.md`)                               |
| `subtitles/`         | Subtitle parsing, segmentation, timing helpers used by the YouTube subtitles entrypoint.                                          |

## For AI Agents

### Working In This Directory

- **Auto-imports are OFF.** Always write explicit `import` statements; never rely on globals.
- **Path alias `@/*` → `src/*`.** WXT-provided `#imports` (for `storage`, `browser`, `i18n`, `defineContentScript`) is the only "magic" import you'll see — everything else is explicit.
- Multiple execution contexts run this code: background SW, popup, options tab, content script, offscreen. Before using `window`, `document`, `chrome.tabs`, etc., verify the caller's context. Many helpers (`getActiveTabUrl`, `analytics.ts`'s `sendMessage`) only make sense in specific contexts.
- **Network from a content script must go through `backgroundFetch`** (`content-script/background-fetch-client.ts`, `auth/auth-client.ts`, `orpc/client.ts`) — direct `fetch()` will be blocked by host-site CSP.
- **Storage keys are centralized** in `constants/config.ts` and `constants/storage-keys.ts`. Never inline raw `local:`/`session:` keys; reuse the exported constants so atoms, sync, and migrations stay aligned.
- **Logging:** use `logger` from `logger.ts` (no-op in prod). Do not commit raw `console.log`.

### Testing Requirements

- Vitest specs live in `__tests__/` folders co-located with each module (e.g. `prompts/__tests__/`, `content/__tests__/`).
- Tests run in node env via the root `vitest.config.ts`. Set `SKIP_FREE_API=true` to skip live-network tests against free providers.
- WXT injects fake browser APIs in tests; do not stub `browser.*` manually unless the test specifically isolates a single API.

### Common Patterns

- **Optimistic-then-persist atoms.** `atoms/config.ts` shows the canonical pattern: set the atom synchronously, queue the storage write through a serial promise chain, version-check before reconciling. Reuse this for any new persisted atom.
- **Background proxy fetch with cache groups.** `auth/auth-client.ts`, `orpc/client.ts`, `content-script/background-fetch-client.ts` all wrap `sendMessage("backgroundFetch", …)`. Pass a `cacheConfig.groupKey` so the response is keyed inside `session-cache/`.
- **Token-bucket + batching.** `request/request-queue.ts` (rate-limited, retried) feeds into `request/batch-queue.ts` (LLM batching with `BatchCountMismatchError` retries + per-item fallback).
- **Prompt templates use `{{token}}` replacement** (`constants/prompt.ts`'s `getTokenCellText`). Always go through `getTranslatePromptFromConfig` / `getSubtitlesTranslatePrompt` so user-customized prompts win.
- **Cross-context atom sync.** All persisted atoms install `onMount` handlers that (1) initial-load from storage, (2) `storage.watch` for cross-context updates, (3) re-load on `visibilitychange` to fix inactive tabs.

## Dependencies

### Internal

- `@/types/*` — Zod schemas (config, providers, translation state, proxy-fetch).
- `@read-frog/api-contract` — oRPC router types consumed by `orpc/client.ts` and `notebase.ts`.
- `@read-frog/definitions` — shared constants (`AUTH_BASE_PATH`, `WEBSITE_PROD_URL`, `LANG_CODE_TO_EN_NAME`, `RTL_LANG_CODES`, …).

### External

- `jotai` + `jotai-family` + `jotai/utils` — atoms layer.
- `ai` + `@ai-sdk/*` — LLM client SDK.
- `@webext-core/messaging` — typed cross-context messaging.
- `@orpc/client` + `@orpc/tanstack-query` — backend RPC.
- `better-auth/react` — authentication client.
- `dexie` — IndexedDB ORM (translation cache, history).
- `zod` (configured `jitless`) — runtime validation.
- `deepmerge-ts`, `dequal`, `clsx`, `tailwind-merge`, `franc`, `js-sha256`, `css-tree`, `@codemirror/lint`, `@iconify/react`, `@mozilla/readability`, `@tanstack/react-query`, `@tanstack/hotkeys`, `sonner`.

<!-- MANUAL: -->
