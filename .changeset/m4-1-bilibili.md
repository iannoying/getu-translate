---
"@getu/extension": patch
---

feat(subtitles): Bilibili video subtitle translation

Bilibili video pages (bilibili.com/video/BVxxx) now support bilingual
subtitle overlay, sharing the same Shadow Root overlay and Jotai scheduler
as YouTube. Uses Bilibili's public `api.bilibili.com/x/player/v2` JSON
subtitle API via background `proxyFetch` (cookies passed through for
logged-in-only content).

- New `BilibiliSubtitlesFetcher` implementing the shared `SubtitlesFetcher`
- Bilibili `PlatformConfig` with new-player (`bpx-player-*`) selectors
- SPA navigation via `history.pushState` monkey-patch + `popstate`
- Host permissions: `*.bilibili.com/*` and `api.bilibili.com/*`

Out of scope: legacy player (`#bilibili-player`), live streams, danmaku comments.
