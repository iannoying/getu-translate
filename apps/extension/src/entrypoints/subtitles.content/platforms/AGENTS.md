<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-24 -->

# platforms

## Purpose

Per-video-platform adapter layer for the subtitles content script. Defines the shared `PlatformConfig` shape (DOM selectors, navigation event names, controls-bar metrics, video-id resolver) and exposes a factory per supported site that wires a `SubtitlesFetcher` to the `UniversalVideoAdapter`. The `registry.ts` central list drives runtime dispatch so new platforms only need their own subdirectory + a registry entry.

Currently implemented: **YouTube**, **Bilibili**, **TED**, **X (Twitter)**.

## Key Files

| File           | Description                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`     | Declares the `ControlsConfig` and `PlatformConfig` interfaces consumed by `UniversalVideoAdapter` and `mountSubtitlesUI`. |
| `registry.ts`  | Central platform registry — maps URL patterns to platform setup factories. `runtime.ts` uses this for dispatch.           |
| `__tests__/`   | Coverage for the registry dispatch + per-platform selector fixtures.                                                      |

## Subdirectories

| Directory   | Purpose                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `youtube/`  | YouTube `PlatformConfig` + `setupYoutubeSubtitles()` factory (ytp selectors, `yt-navigate-*` SPA events).                                                                                                                                  |
| `bilibili/` | Bilibili `PlatformConfig` + setup factory. Handles Bilibili's player DOM and SPA history navigation.                                                                                                                                       |
| `ted/`      | TED `PlatformConfig` + setup factory. TED's talk pages have a simpler player with direct subtitle URLs.                                                                                                                                    |
| `x/`        | X (Twitter) `PlatformConfig` + setup factory. Handles inline video players inside tweet timelines.                                                                                                                                         |

## For AI Agents

### Working In This Directory

- A `PlatformConfig` MUST provide `selectors.video`, `selectors.playerContainer`, `selectors.controlsBar`, and `selectors.nativeSubtitles`; the adapter relies on all four.
- `getVideoId` is optional but required for SPA navigation reset to work — without it, `videoIdChanged` is always false and the adapter will not re-fetch subtitles when the URL changes.
- `controls.measureHeight` / `controls.checkVisibility` receive a container element (the React shadow host wrapper) and walk up to the player to read live YouTube classes (e.g., `ytp-autohide`, `.ytp-progress-bar-container`).
- To add a platform: create `<platform>/config.ts` exporting a `PlatformConfig`, `<platform>/index.ts` exporting `setup<Platform>Subtitles()`, and add the URL-pattern → setup mapping to `registry.ts`. `../runtime.ts` dispatches off that registry — no new init file needed.

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
