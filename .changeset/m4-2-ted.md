---
"@getu/extension": patch
---

feat(subtitles): TED talk subtitle translation

TED talk pages (ted.com/talks/{slug}) now support bilingual subtitle
overlay, sharing the same Shadow Root overlay and Jotai scheduler as
YouTube + Bilibili. Uses TED's public `/talks/{slug}/transcript.json`
endpoint (no auth, no cookies) via background `proxyFetch`.

- New `TedSubtitlesFetcher` implementing the shared `SubtitlesFetcher`
- TED `PlatformConfig` targeting the React player via stable
  class-contains selectors
- Page-load + `popstate` init (TED pages are full navigations, no SPA
  history patch required)
- Host permissions + content script match: `*.ted.com/*`

Out of scope: TED Ed (`/ed/...`), playlists, conference archives,
non-English source languages.
