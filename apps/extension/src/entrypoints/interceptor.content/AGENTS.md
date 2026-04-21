<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# interceptor.content

## Purpose

A YouTube-only content script that runs in `world: "MAIN"` at `document_start` so it can monkey-patch `XMLHttpRequest` and call YouTube's internal `<html5-video-player>` API directly. It exposes a small `window.postMessage` RPC that `subtitles.content` (running in the isolated world) uses to fetch player data, wait for a fresh `api/timedtext` URL with a valid `pot` (Proof-of-Origin Token), and toggle the captions button when the user starts translating. Without this MAIN-world bridge, the isolated content script cannot read `getPlayerResponse()`, `getAudioTrack()`, or YouTube's authenticated subtitle URLs.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`              | `defineContentScript({ matches: ["*://*.youtube.com/*"], world: "MAIN", runAt: "document_start" })` — calls `injectPlayerApi()` once.                                                                                                                                                                                                                                         |
| `inject-player-api.ts`  | Sets up the timedtext observer + `window.message` handlers for `PLAYER_DATA_REQUEST`, `WAIT_TIMEDTEXT_REQUEST`, and `ENSURE_SUBTITLES_REQUEST`; reads `playerResponse.captions`, audio captions, `ytcfg.DEVICE`, `cver`, current player state, and active track language; ensures captions are on by clicking `.ytp-subtitles-button` or invoking `player.toggleSubtitles()`. |
| `timedtext-observer.ts` | Patches `XMLHttpRequest.prototype.open/send` so every load is inspected; URLs matching `/api\/timedtext/` with both `v` (videoId) and `pot` query params are cached per video, and `waitForTimedtextUrl(videoId, timeoutMs)` resolves either from cache or from a per-video waiter list with a timeout fallback.                                                              |
| `utils.ts`              | `errorResponse`, `normalizeTracks` (absolute-URL fixup for `baseUrl`), and `parseAudioTracks` — converts YouTube's raw track shapes into `CaptionTrack`/`AudioCaptionTrack` defined in `@/utils/subtitles/fetchers/youtube/types`.                                                                                                                                            |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- This script runs in `world: "MAIN"` — `browser.*`, `chrome.*`, and any `@/utils/message` (webext-core) calls are unavailable. Use `window.postMessage` only.
- Always filter incoming messages by `event.origin !== window.location.origin` to avoid trusting cross-origin `postMessage`s — already enforced in `handleMessage`.
- Request/response pairs are correlated by `requestId`; the constants for type strings live in `@/utils/constants/subtitles` (`PLAYER_DATA_REQUEST_TYPE`, `ENSURE_SUBTITLES_RESPONSE_TYPE`, `TIMEDTEXT_WAIT_TIMEOUT_MS`, etc.) — do not duplicate them here.
- The XHR observer must be installed at `document_start` before YouTube's bundle issues any timedtext requests; preserve `runAt: "document_start"` if you change the entrypoint.
- A timedtext URL is only useful if it carries a `pot` param — `cacheTimedtextUrl` rejects URLs without one. Do not relax this check; without `pot` the URL fails for users who lack the cookie.
- `findYoutubePlayer()` queries `.html5-video-player.playing-mode, .html5-video-player.paused-mode` — both states must be matched; `cued`/loading states will return null.

### Testing Requirements

Run `pnpm test` (Vitest). No co-located `__tests__/` here; subtitle behaviour is exercised in `subtitles.content/__tests__/` and `@/utils/subtitles/__tests__/`. Live-network tests respect `SKIP_FREE_API=true`.

### Common Patterns

- `window.postMessage` request/response with `{type, requestId, ...}` pairs (defined as string constants in `@/utils/constants/subtitles`).
- Per-video waiter map (`Map<videoId, Array<resolve>>`) plus per-video URL cache, with `setTimeout`-based fallback resolution.
- XHR monkey-patch: store `_url` on `open`, inspect `responseURL` on `load`.

## Dependencies

### Internal

- `@/utils/constants/subtitles` — request/response type strings, `TIMEDTEXT_WAIT_TIMEOUT_MS`.
- `@/utils/subtitles/fetchers/youtube/types` — `CaptionTrack`, `AudioCaptionTrack`, `PlayerData`.

### External

- `#imports` — `defineContentScript` only.
- Direct browser globals: `XMLHttpRequest`, `window.postMessage`, `document.querySelector`, `URL`. No `browser.*` API in MAIN world.

<!-- MANUAL: -->
