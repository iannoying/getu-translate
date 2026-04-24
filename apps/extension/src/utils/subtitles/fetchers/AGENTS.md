<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-24 -->

# fetchers

## Purpose

Defines the `SubtitlesFetcher` interface that the subtitle overlay polls for fragments and hosts per-platform implementations. Ships one fetcher per supported video platform: YouTube (injected-script `postMessage` for player data + POT-token + timedtext), Bilibili, TED, and X (Twitter). Each fetcher is responsible for discovering the native subtitle tracks, selecting the best one, fetching the payload, and parsing it into the shared `SubtitleFragment` shape.

## Key Files

| File       | Description                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | Barrel: re-exports the `SubtitlesFetcher` interface plus every platform fetcher (`Youtube`, `Bilibili`, `Ted`, `X`).      |
| `types.ts` | The `SubtitlesFetcher` interface: `fetch`, `cleanup`, `shouldUseSameTrack`, `getSourceLanguage`, `hasAvailableSubtitles`. |

## Subdirectories

| Directory   | Purpose                                                                                                                                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `youtube/`  | YouTube implementation: `index.ts` (orchestrator + track selection priority), `format-detector.ts`, `noise-filter.ts`, `pot-token.ts`, `url-builder.ts`, `types.ts` (Zod-validated `youtubeSubtitlesResponseSchema`), and `parser/` (`standard-parser`, `scrolling-asr-parser`, `karaoke-parser`, `stylized-karaoke-parser`). |
| `bilibili/` | Bilibili implementation — fetches CC track metadata via Bilibili's player API, handles AID/BVID resolution, parses the CC JSON payload into fragments.                                                                                                                                                                        |
| `ted/`      | TED implementation — fetches the talk's subtitle manifest from TED's API and parses the JSON transcripts.                                                                                                                                                                                                                     |
| `x/`        | X (Twitter) implementation — extracts inline video subtitle URLs from the timeline tweet payload and parses the subtitle track.                                                                                                                                                                                               |

## For AI Agents

### Working In This Directory

- Every new platform implements the full `SubtitlesFetcher` contract — including `shouldUseSameTrack()` (track-hash equality check used by the overlay to skip redundant re-fetches on URL change) and `cleanup()` (clear caches when navigating away).
- YouTube fetching uses `postMessage` to a content-script-injected page-context script for player data; do not import that script directly from the fetcher — keep the message-protocol constants (`PLAYER_DATA_REQUEST_TYPE`, `WAIT_TIMEDTEXT_REQUEST_TYPE`, etc.) in `@/utils/constants/subtitles`.
- Track selection priority in `youtube/index.ts#selectTrack` is: user-selected → human-without-name → human-with-name → ASR → first-available. This sequence matters for translated-track avoidance; don't reorder.
- HTTP error classification in `fetchWithRetry`: 403/404/429 throw `OverlaySubtitlesError` (no retry); 500 and unknowns throw `Error` (retried up to `MAX_FETCH_RETRIES`). Preserve the type distinction so retries don't burn quota.
- Format detection (`format-detector.ts`) runs after `filterNoiseFromEvents` and before parser dispatch. New parsers must register a format string in `detectFormat` and a `parse...` function exposed via `youtube/parser/index.ts`.
- `cachedTrackHash` is `${videoId}:${languageCode}:${kind ?? ''}:${vssId}` — keep all four components or stale subtitles will be served when YouTube swaps tracks.

### Testing Requirements

- Vitest. Parser tests live next to each parser file in `youtube/parser/__tests__/`. Mock `fetch` and the `postMessage` round-trip; do not depend on a real YouTube page.
- No `SKIP_FREE_API` interaction here — these are mock-driven.

### Common Patterns

- Promise-wrapped `postMessage` round-trips with a per-request UUID and a timeout (`POST_MESSAGE_TIMEOUT_MS`); resolves to `null` on timeout, never rejects.
- Append-only parser dispatch via `detectFormat(events)` returning a discriminant string consumed by a `switch`/`if` cascade.
- Zod-validated network responses (`youtubeSubtitlesResponseSchema.safeParse(data)`) with a hard error on schema mismatch.

## Dependencies

### Internal

- `@/utils/subtitles/types`, `@/utils/subtitles/errors`, `@/utils/subtitles/video-id`
- `@/utils/config/storage` (reads `videoSubtitles.aiSegmentation` to decide parser path)
- `@/utils/constants/subtitles` (all `*_REQUEST_TYPE`/`*_RESPONSE_TYPE`, retry/wait constants)
- `@/utils/crypto-polyfill` (`getRandomUUID`)

### External

- `#imports` from WXT — `i18n` for error messages
- `zod` (transitive via `youtubeSubtitlesResponseSchema`)

<!-- MANUAL: -->
