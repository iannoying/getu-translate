<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-24 -->

# video-id

## Purpose

Per-platform synchronous resolution of the current page's video identifier from `window.location`. Lets fetchers and overlay code reach the canonical id without parsing URLs ad-hoc. Ships one resolver per supported platform: YouTube, Bilibili, TED, and X.

## Key Files

| File          | Description                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`    | Barrel: re-exports `getYoutubeVideoId`, `getBilibiliVideoId`, `getTedVideoId`, `getXVideoId`.                                                                                                                                                              |
| `youtube.ts`  | `getYoutubeVideoId()` — `?v=` → `/embed/<id>` → `youtu.be/<id>`. Returns `null` when no id is found. Uses pre-compiled regexes `EMBED_PATH_PATTERN` and `SHORT_URL_PATH_PATTERN`.                                                                          |
| `bilibili.ts` | `getBilibiliVideoId()` — resolves BVID / AID from Bilibili's `/video/<id>` URLs and legacy `av<id>` forms.                                                                                                                                                  |
| `ted.ts`      | `getTedVideoId()` — extracts the talk slug from `/talks/<slug>` URLs; trailing `/transcript` path strips cleanly.                                                                                                                                           |
| `x.ts`        | `getXVideoId()` — resolves inline video status ids from X (Twitter) `/<user>/status/<id>` URLs.                                                                                                                                                            |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- All resolvers are SYNCHRONOUS and DOM-free; they only read `window.location`. Don't introduce async signatures — fetchers call these in tight equality-check paths (`buildTrackHash`).
- Add a new platform by creating `<platform>.ts` and re-exporting via `index.ts`. Keep one resolver per file for tree-shake friendliness.
- Resolution priority for YouTube is `?v=` → `/embed/<id>` → `youtu.be/<id>`. Mirror the same "most specific first" priority for any new platform.
- Return `null` (not `undefined`, not empty string) when no id is found — callers branch on `null`.

### Testing Requirements

- Vitest. Tests stub `window.location` per case (`?v=...`, `/embed/...`, `youtu.be/...`, malformed) and assert the return value. No live network involved.

### Common Patterns

- Module-level pre-compiled regex constants (e.g. `EMBED_PATH_PATTERN`, `SHORT_URL_PATH_PATTERN`).
- Pure functions with no caching — `window.location` is the source of truth and changes on every SPA navigation.

## Dependencies

### Internal

- None.

### External

- Web Platform: `window.location`, `URLSearchParams`.

<!-- MANUAL: -->
