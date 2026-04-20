<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# platforms

## Purpose

Per-video-platform adapter layer for the subtitles content script. Defines the shared `PlatformConfig` shape (DOM selectors, navigation event names, controls-bar metrics, video-id resolver) and exposes a factory per supported site that wires a `SubtitlesFetcher` to the `UniversalVideoAdapter`. Today only YouTube is implemented; the abstraction exists so additional platforms (Netflix, Bilibili, etc.) can be added without changing the runtime or scheduler.

## Key Files

| File       | Description                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | Declares the `ControlsConfig` and `PlatformConfig` interfaces consumed by `UniversalVideoAdapter` and `mountSubtitlesUI`. |

## Subdirectories

| Directory  | Purpose                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `youtube/` | YouTube `PlatformConfig` (selectors for `video.html5-main-video`, `#movie_player`, `.ytp-right-controls`, `yt-navigate-*` events) and `setupYoutubeSubtitles()` factory that pairs `YoutubeSubtitlesFetcher` with `UniversalVideoAdapter`. |

## For AI Agents

### Working In This Directory

- A `PlatformConfig` MUST provide `selectors.video`, `selectors.playerContainer`, `selectors.controlsBar`, and `selectors.nativeSubtitles`; the adapter relies on all four.
- `getVideoId` is optional but required for SPA navigation reset to work — without it, `videoIdChanged` is always false and the adapter will not re-fetch subtitles when the URL changes.
- `controls.measureHeight` / `controls.checkVisibility` receive a container element (the React shadow host wrapper) and walk up to the player to read live YouTube classes (e.g., `ytp-autohide`, `.ytp-progress-bar-container`).
- To add a platform: create `<platform>/config.ts` exporting a `PlatformConfig`, `<platform>/index.ts` exporting `setup<Platform>Subtitles()`, and a sibling `init-<platform>-subtitles.ts` invoked from `../runtime.ts`.

### Testing Requirements

- No tests live in this directory; behavior is exercised through `../__tests__/universal-adapter.test.ts`.
- Run via `pnpm test`. `SKIP_FREE_API=true` is irrelevant here (no network) but applies to fetcher tests under `src/utils/subtitles/`.

### Common Patterns

- Platform adapter pattern: configuration data only — no side effects at module evaluation time.
- DOM-driven measurement instead of cached values: `measureHeight` reads `getBoundingClientRect()` on every call so layout changes (theater/full-screen) are picked up without observers.
- Constants for selector strings (`YOUTUBE_NATIVE_SUBTITLES_CLASS`, `YOUTUBE_NAVIGATE_*_EVENT`) live in `@/utils/constants/subtitles` so they can be reused by tests and renderer code.

## Dependencies

### Internal

- `@/utils/subtitles/fetchers` — `YoutubeSubtitlesFetcher` implementing the `SubtitlesFetcher` interface.
- `@/utils/subtitles/video-id` — `getYoutubeVideoId()` SPA-safe resolver.
- `@/utils/constants/subtitles` — selector and event-name constants, `DEFAULT_CONTROLS_HEIGHT`.
- `../universal-adapter` — `UniversalVideoAdapter` instantiated by the factory.

### External

- None directly; this layer is intentionally framework-agnostic.

<!-- MANUAL: -->
