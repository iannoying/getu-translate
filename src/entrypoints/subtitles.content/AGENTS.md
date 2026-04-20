<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# subtitles.content

## Purpose

WXT content script (matches `*://*.youtube.com/*`) that overlays AI-translated, optionally AI-resegmented subtitles on top of native video subtitles. The script gates injection on `videoSubtitles.enabled` config and a `__READ_FROG_SUBTITLES_INJECTED__` window flag, then dynamically imports the runtime which wires together a per-platform adapter, a Jotai-backed scheduler, an AI segmentation pipeline, and a streaming translation coordinator. Native captions are hidden via an injected `<style>` only while the overlay is active, and the React UI is mounted into a Shadow Root attached to the platform's player container.

## Key Files

| File                         | Description                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                  | WXT `defineContentScript` entrypoint; double-injection guard, config gate, lazy `runtime` import.                                                                                                                         |
| `runtime.ts`                 | Idempotent bootstrap that calls `initYoutubeSubtitles()` once per page lifetime.                                                                                                                                          |
| `init-youtube-subtitles.ts`  | YouTube SPA-aware initializer: re-mounts UI on `YOUTUBE_NAVIGATE_FINISH_EVENT`, calls `adapter.initialize()` once.                                                                                                        |
| `universal-adapter.ts`       | `UniversalVideoAdapter` — orchestrates fetcher, scheduler, segmentation pipeline, translation coordinator; handles SPA navigation reset, native-subtitle hiding, auto-start, source-subtitle download, and analytics.     |
| `subtitles-scheduler.ts`     | `SubtitlesScheduler` listens to `timeupdate`/`seeking`, finds the active cue by time, and pushes `currentSubtitleAtom` / `subtitlesStateAtom` updates; auto-hides error state after 5s.                                   |
| `segmentation-pipeline.ts`   | Async loop that walks raw fragments forward in time, batches by `PROCESS_LOOK_AHEAD_MS`, runs `aiSegmentBlock` + `optimizeSubtitles`, and replaces processed chunks in place.                                             |
| `translation-coordinator.ts` | Reacts to `timeupdate`/`seeked`, batches uncached fragments within `TRANSLATE_LOOK_AHEAD_MS`, calls `translateSubtitles`, emits `loading`/`error` state, and falls back to original text on translationOnly mode failure. |
| `atoms.ts`                   | Dedicated Jotai `subtitlesStore` plus atoms for current time, current subtitle, state, visibility, settings panel, and derived show-state/show-content selectors.                                                         |

## Subdirectories

| Directory    | Purpose                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `platforms/` | Per-platform `PlatformConfig` (selectors, navigation events, controls metrics) and adapter factory (see `platforms/AGENTS.md`). |
| `renderer/`  | Shadow Root mount entrypoints for the subtitle overlay and the YouTube controls-bar toggle button (see `renderer/AGENTS.md`).   |
| `ui/`        | React components and hooks for the overlay, settings panel, and translate-button trigger (see `ui/AGENTS.md`).                  |

## For AI Agents

### Working In This Directory

- The runtime is YouTube-only today — `init-youtube-subtitles.ts` checks `YOUTUBE_WATCH_URL_PATTERN`. Add new sites by introducing a new `PlatformConfig` under `platforms/` and a new `init-*-subtitles.ts`, then call it from `runtime.ts`.
- Always go through `subtitlesStore.set(...)` for atom writes from non-React code; the store is created with `createStore()` so it is independent of any React Provider.
- Navigation handling is asymmetric: `handleNavigationStart` hides UI immediately when `videoIdChanged`, then `handleNavigationFinish` re-initializes after `NAVIGATION_HANDLER_DELAY` to let YouTube's DOM settle.
- The scheduler, segmentation pipeline, and translation coordinator are decoupled by callbacks (`getFragments`, `getVideoElement`, `onTranslated`, `onStateChange`). Do not let one reach into another's internal state.
- `clearRuntimeSession` vs `clearSourceCache`: source fragments may be reused across same-track resumes (see `subtitlesFetcher.shouldUseSameTrack()`); only the runtime session resets each translation start.
- Translation summary fetching is keyed via `buildSubtitlesSummaryContextHash` so a stale summary from a previous video does not contaminate `videoContext.summary`.

### Testing Requirements

- Unit tests live in `__tests__/` (`segmentation-pipeline.test.ts`, `subtitles-scheduler.test.ts`, `universal-adapter.test.ts`).
- Run with `pnpm test` (Vitest). Set `SKIP_FREE_API=true` to skip live-network tests in `src/utils/subtitles/**`.
- Mock `getLocalConfig`, `aiSegmentBlock`, and `translateSubtitles` when exercising adapter/coordinator logic — they are the side-effect boundary.

### Common Patterns

- Shadow-DOM mounting: the React overlay lives inside `attachShadow({ mode: "open" })` on a dedicated host appended to the YouTube player container; Tailwind theme is inlined via `themeCSS?inline`.
- SPA navigation handling using YouTube's `yt-navigate-start` / `yt-navigate-finish` custom events (re-exposed by constants), not `popstate`.
- Single-flight async loops (`SegmentationPipeline.runLoop`, `TranslationCoordinator.translateNearby`) guarded by `running` / `isTranslating` flags.
- Look-ahead windows (`PROCESS_LOOK_AHEAD_MS`, `TRANSLATE_LOOK_AHEAD_MS`) ensure work happens just-in-time rather than translating the entire transcript up front.
- `Set<number>` of fragment `start` times tracks `segmentedRawStarts`, `translatingStarts`, `translatedStarts`, `failedStarts` — fragments are deduped by their start timestamp.

## Dependencies

### Internal

- `@/utils/subtitles/*` — fetchers, processor (`aiSegmentBlock`, `optimizeSubtitles`, `translateSubtitles`, `buildSubtitlesSummaryContextHash`, `fetchSubtitlesSummary`), `srt` exporter, `display-rules`, `errors` (`OverlaySubtitlesError`, `ToastSubtitlesError`), and `types`.
- `@/utils/config/storage` (`getLocalConfig`), `@/utils/config/helpers` (`getProviderConfigById`), `@/utils/atoms/config` (`configFieldsAtomMap.videoSubtitles`).
- `@/utils/constants/subtitles` for selectors, event names, timing constants, and `DEFAULT_SUBTITLE_POSITION`.
- `@/utils/dom/wait-for-element` for waiting on YouTube DOM nodes; `@/utils/analytics` for `trackFeatureUsed`.

### External

- `jotai` — local `subtitlesStore` for cross-render-tree state without polluting global Jotai.
- `sonner` — toast surface for unrecoverable errors raised through `ToastSubtitlesError`.
- `react`, `react-dom/client` — Shadow Root rendering.
- `#imports` (WXT virtual) — `defineContentScript`, `i18n`.

<!-- MANUAL: -->
