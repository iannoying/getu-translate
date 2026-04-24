# @getu/extension

## 1.33.1

### Patch Changes

- [#160](https://github.com/iannoying/getu-translate/pull/160) [`6934284`](https://github.com/iannoying/getu-translate/commit/6934284a756cd9683fd5b5817a6a461384e5c822) Thanks [@iannoying](https://github.com/iannoying)! - chore(ui): remove Discord, WeChat group, and Star-on-GitHub entries from the popup header + "More" menu

## 1.33.0

### Minor Changes

- [#35](https://github.com/iannoying/getu-translate/pull/35) [`e0e03ea`](https://github.com/iannoying/getu-translate/commit/e0e03ea05e7ccf4ef9649d913d48dfdffda67798) Thanks [@iannoying](https://github.com/iannoying)! - feat(input): enforce daily 50-translation quota for free users (M2 PR A)

  Free users are now capped at 50 successful input-field translations per local day; over the cap opens the upgrade dialog. Pro users holding the `input_translate_unlimited` feature remain uncapped. Counter is local-timezone `YYYY-MM-DD` and persists in IndexedDB so it survives tab reloads.

- [#55](https://github.com/iannoying/getu-translate/pull/55) [`51061b3`](https://github.com/iannoying/getu-translate/commit/51061b331445685f9eb218c607ffabdfa3449f6d) Thanks [@iannoying](https://github.com/iannoying)! - feat(input): trigger-token mode + Options UI for input-field translation (M2 PR B)

  Adds immersive-translate-style trigger-token support (e.g. `hello //en `) alongside the existing triple-space trigger. Users can switch modes from **Options → Input Translation → Trigger Mode** and customize the token prefix. IME composition (Chinese / Japanese / Korean) is respected so typing through an IME never misfires the token match. Config schema bumped to v069 with a non-destructive migration that backfills `triple-space` + `//` defaults.

- [#65](https://github.com/iannoying/getu-translate/pull/65) [`35418e5`](https://github.com/iannoying/getu-translate/commit/35418e566be5e7adf9920024897565727ab513f2) Thanks [@iannoying](https://github.com/iannoying)! - feat: M3 PR#A — PDF viewer foundation

  - New `pdf-viewer` entrypoint powered by `pdfjs-dist` replaces the browser's default PDF viewer
  - Background `.pdf` navigation interception with first-use opt-in toast (Translate / This time / Never)
  - Popup "Translate current PDF" manual fallback button for blocked / manual-mode users
  - Options "PDF Translation" settings page: global switch, activation mode (always / ask / manual), domain blocklist, `file://` access detection with guidance card
  - New `pdfTranslation` config slice + v069→v070 migration
  - Chrome + Firefox MV3 compatible (Firefox build verified; runtime compatibility noted in pdf-viewer AGENTS.md)
  - No translation rendering yet — PR #B will add segment translation, quota, and double-language overlay

### Patch Changes

- [`da2e94b`](https://github.com/iannoying/getu-translate/commit/da2e94bb151e1dca2ca2ac31d777df28210452af) Thanks [@mengxi-ream](https://github.com/mengxi-ream)! - fix(selection-toolbar): add more cursor clearance after text selection

- [`74f4219`](https://github.com/iannoying/getu-translate/commit/74f42196158be314dc65dc6e9c00b78ab021be23) Thanks [@mengxi-ream](https://github.com/mengxi-ream)! - fix(selection-toolbar): derive custom action webpage context by popover session

- [`74f16a9`](https://github.com/iannoying/getu-translate/commit/74f16a98d8d8e390ecf8aadc1a5a1db7990310e9) Thanks [@taiiiyang](https://github.com/taiiiyang)! - fix(subtitles): support stylized YouTube karaoke parsing and source export

- [`08b40e8`](https://github.com/iannoying/getu-translate/commit/08b40e82cd2c8d7b46e2cac8e1d87672c813fe0b) Thanks [@frogGuaGuaGuaGua](https://github.com/frogGuaGuaGuaGua)! - fix: keep floating button close menu aligned after reopening

- [#153](https://github.com/iannoying/getu-translate/pull/153) [`69e342d`](https://github.com/iannoying/getu-translate/commit/69e342d30eaddba4a359f930fa73a509ad3490a9) Thanks [@iannoying](https://github.com/iannoying)! - feat(ui): clicking the avatar or account name in the popup header now opens the GetU Translate homepage in a new tab, with a pointer cursor on hover

- [#146](https://github.com/iannoying/getu-translate/pull/146) [`039565a`](https://github.com/iannoying/getu-translate/commit/039565a4c5cd68fd5b8fdf676218542d3182544c) Thanks [@iannoying](https://github.com/iannoying)! - fix(auth): route auth + oRPC requests to api.getutranslate.com so web-logged-in users are recognized in the extension

- [#128](https://github.com/iannoying/getu-translate/pull/128) [`cc83593`](https://github.com/iannoying/getu-translate/commit/cc83593b50aae08b403886f602fe069201992882) Thanks [@iannoying](https://github.com/iannoying)! - fix(build): make unpacked extension output load correctly in Chrome

- [#151](https://github.com/iannoying/getu-translate/pull/151) [`be87936`](https://github.com/iannoying/getu-translate/commit/be879366355cfd310882fafafa985bab3aad0ba8) Thanks [@iannoying](https://github.com/iannoying)! - fix(pdf): auto-redirect PDFs served without `.pdf` suffix (arxiv `/pdf/2507.15551`, CMS handlers) via `Content-Type: application/pdf` sniffing in a new `webRequest.onHeadersReceived` listener; the fast `.pdf`-suffix path is kept as the primary trigger

- [#158](https://github.com/iannoying/getu-translate/pull/158) [`cfea760`](https://github.com/iannoying/getu-translate/commit/cfea760e8f05549d13c7fce0b18a8175c5492345) Thanks [@iannoying](https://github.com/iannoying)! - fix(pdf-viewer): set `globalThis.pdfjsLib` before importing `pdfjs-dist/web/pdf_viewer.mjs` so the viewer module can destructure `AbortException` and friends; previously the parallel `Promise.all` import could race and throw "Cannot destructure property 'AbortException' of 'globalThis.pdfjsLib' as it is undefined"

- [#149](https://github.com/iannoying/getu-translate/pull/149) [`2feb5ed`](https://github.com/iannoying/getu-translate/commit/2feb5ed40ba0c15778800f0b88a422df0f1418c9) Thanks [@iannoying](https://github.com/iannoying)! - fix(ui): show the email local-part (before `@`) in the popup header when the signed-in user has no display name (e.g. email-OTP accounts) instead of rendering nothing

- [`fe2eedd`](https://github.com/iannoying/getu-translate/commit/fe2eeddc3d49a5554d26454271a8ca27ea16245b) Thanks [@ananaBMaster](https://github.com/ananaBMaster)! - fix(models): skip unsupported thinking options for instruct variants

- [`af78eac`](https://github.com/iannoying/getu-translate/commit/af78eac3676e0d6ce8b656305c83c39e444836cf) - feat(i18n): add billing and paywall copy across all 8 locales (M0 Task 7)

- [`0eaf489`](https://github.com/iannoying/getu-translate/commit/0eaf4895241f47a4e47d70832fd7cae4ad089ea3) - feat(db): add entitlements_cache Dexie table (M0 Task 2)

- [`c05a5ac`](https://github.com/iannoying/getu-translate/commit/c05a5ac9c14595568d0886f010b13ff05a9e93a6) - feat(types): add entitlements schema for upcoming billing (M0 Task 1)

- [`83536ad`](https://github.com/iannoying/getu-translate/commit/83536ad1cbb9a67c70324f91f7226f617630b9a5) - feat(analytics): enable PostHog feature flags and expose useFeatureFlag hook (M0 Task 4)

- [`c5f769c`](https://github.com/iannoying/getu-translate/commit/c5f769ceb1551571bf7fbac415b178a9008323e9) Thanks [@iannoying](https://github.com/iannoying)! - feat(options): add Account & Subscription section (M0 Task 6)

- [`759234d`](https://github.com/iannoying/getu-translate/commit/759234d4f6fb019aa0a31aea40c92cbe4a1dc081) Thanks [@iannoying](https://github.com/iannoying)! - feat(billing): add ProGate, UpgradeDialog, and useProGuard (M0 Task 5)

- [`b50be6e`](https://github.com/iannoying/getu-translate/commit/b50be6e8addfae41db248595dbca30f09e146fd0) Thanks [@iannoying](https://github.com/iannoying)! - feat(hooks): add useEntitlements with offline fallback (M0 Task 3)

- [`9b87656`](https://github.com/iannoying/getu-translate/commit/9b87656ac490df25292f981401e3524f63fd8e9d) Thanks [@iannoying](https://github.com/iannoying)! - feat(translate): add Bing Web translation provider (M1 Task 2)

- [`5316f84`](https://github.com/iannoying/getu-translate/commit/5316f847be6d7aec07f85a35ac867cd2f058e914) Thanks [@iannoying](https://github.com/iannoying)! - feat(translate): dispatcher with circuit-breaker fallback chain (M1 Task 5)

- [`d925db2`](https://github.com/iannoying/getu-translate/commit/d925db2bd1e87686d05600fcbd5e32a766f81c69) Thanks [@iannoying](https://github.com/iannoying)! - feat(translate): add FreeProviderHealth circuit breaker (M1 Task 1)

- [`de09383`](https://github.com/iannoying/getu-translate/commit/de09383e8c08b80f65e83da4a86adc584bd60bdf) Thanks [@iannoying](https://github.com/iannoying)! - feat(translate): add LibreTranslate provider (M1 Task 4)

- [`1ab37d7`](https://github.com/iannoying/getu-translate/commit/1ab37d7938ee0ad5e028ee294a5aefcb3b784b03) Thanks [@iannoying](https://github.com/iannoying)! - feat(options): expose Bing / Yandex / LibreTranslate in free provider picker (M1 Task 6)

- [`eb4ff74`](https://github.com/iannoying/getu-translate/commit/eb4ff741830b1bedb664b4cc3eec7bea6320c750) Thanks [@iannoying](https://github.com/iannoying)! - feat(translate): add Yandex Web translation provider (M1 Task 3)

- [#97](https://github.com/iannoying/getu-translate/pull/97) [`2eac935`](https://github.com/iannoying/getu-translate/commit/2eac935ded1b035829aafe776e824ffb1ddd1e07) Thanks [@iannoying](https://github.com/iannoying)! - feat(pdf-viewer): inline bilingual PDF export

  Pro-tier exported PDFs now place each translation **directly below its
  source paragraph** using captured bounding-box coordinates, replacing the
  earlier footer-only layout. Result: reading flow matches a native bilingual
  document instead of cross-referencing a footnotes block.

  - `PdfTranslationParagraph` schema gained optional `boundingBox`
    (Dexie schema v8 → v9; no data loss, legacy rows untouched)
  - `PageCacheCoordinator` captures `boundingBox` when writing cache
  - `pdf-lib-writer` prefers inline layout per page; legacy cache rows
    without bbox fall back to footer
  - Users who want inline output for previously-cached PDFs: Options →
    "Clear cache" then re-translate

- [#99](https://github.com/iannoying/getu-translate/pull/99) [`667b22b`](https://github.com/iannoying/getu-translate/commit/667b22b6fb2e25bc0e3bd70eaeece2bbda136fea) Thanks [@iannoying](https://github.com/iannoying)! - feat(i18n): translate M3 PDF viewer strings into 7 non-English locales

  The `pdfViewer.*` and `options.pdfTranslation.*` keys added in the M3
  milestone now have real translations in zh-CN, zh-TW, ja, ko, ru, tr, vi
  (previously English with TODO markers).

- [#95](https://github.com/iannoying/getu-translate/pull/95) [`51be53e`](https://github.com/iannoying/getu-translate/commit/51be53e5e52f51fbef7882be3e935ef9733bea96) Thanks [@iannoying](https://github.com/iannoying)! - chore: M3 follow-ups — memory cleanup + font subset + scheduler back-off

  Three non-blocking improvements from M3 B2/B3/C merge-gate review:

  - **Memory cleanup** — bounded LRU (50 pages) on the pdf-viewer's per-page
    overlay/coordinator/pending-seq/known-paragraphs state; prevents heap
    growth on 500+ page PDFs. Cache re-hydrates from Dexie on re-visit
  - **CJK font subset** — `noto-sans-cjk-sc-subset.otf` shrunk from ~5 MB
    to ~815 KB by limiting to GB 2312 Level 1 (3755 most-common Mandarin
    chars, ~99.9% corpus coverage) instead of all 20K+ CJK Unified glyphs;
    drops extension bundle from ~20 MB to ~15.8 MB
  - **Scheduler retry** — `TranslationScheduler` now retries with exponential
    back-off (1s/2s/4s, 3 attempts max) on 429/503/network/timeout/fetch
    errors; non-retriable errors still fail-fast. Respects AbortSignal.
    Stability win under free-tier provider rate limits

- [#78](https://github.com/iannoying/getu-translate/pull/78) [`0c56d25`](https://github.com/iannoying/getu-translate/commit/0c56d25ccfd3d58b66498e61dc8b2caa8ff83884) Thanks [@iannoying](https://github.com/iannoying)! - feat: M3 PR#B1 — paragraph detection + overlay skeleton

  - BabelDOC-inspired paragraph detection from pdf.js textLayer (pure TS, fixture-driven tests)
  - Independent overlay layer: placeholder `[...]` slots below each paragraph
  - Zoom + page navigation preserve overlay alignment (4-corner viewport projection)
  - Push-down layout primitive reserves vertical space for upcoming translation blocks
  - No translation yet — PR #B2 wires the scheduler

- [#86](https://github.com/iannoying/getu-translate/pull/86) [`613786c`](https://github.com/iannoying/getu-translate/commit/613786c225c58979d3999b976fa0c82c187320c4) Thanks [@iannoying](https://github.com/iannoying)! - feat: M3 PR#B2 — translation scheduler + progressive rendering

  - `TranslationScheduler` with concurrency 6 (configurable), AbortSignal support, dedup + error-retry semantics
  - Per-viewer Jotai Provider + shared store (replaces direct storageAdapter writes)
  - `segmentStatusAtomFamily` drives per-paragraph UI state (pending → translating → done | error)
  - Overlay slots render real translations progressively via `<SegmentContent>`, replacing `[...]` placeholders as each provider call returns
  - First-use toast "Accept" now wired: flips `enqueuePolicy` from "blocked" to "enabled" and retro-enqueues all known paragraphs
  - Scheduler reuses existing `translateTextForPage` pipeline (free/AI dispatch + hash cache)
  - No quota / cache yet — PR #B3 adds daily page limits + file-hash cache

- [#92](https://github.com/iannoying/getu-translate/pull/92) [`f0fcbb9`](https://github.com/iannoying/getu-translate/commit/f0fcbb99eb5bf437f8cc52be3c56d64c14ddcb29) Thanks [@iannoying](https://github.com/iannoying)! - feat: M3 PR#B3 — PDF translation cache + quota + UpgradeDialog

  - `pdfTranslations` Dexie table — per-(fileHash, pageIndex, targetLang, providerId) cache row, 30-day LRU eviction
  - `pdfTranslationUsage` daily counter — mirrors M2 input-translation-usage pattern
  - `usePdfTranslationQuota` hook enforcing Free 50 pages/day (Q2 count-on-success)
  - `PageCacheCoordinator` — cache-first lookup; full-page cache write on success
  - Hard-stop on 50th fresh page success: `scheduler.abort()` + `UpgradeDialog` pops; already-translated pages remain visible
  - Pro users with `pdf_translate_unlimited` bypass the limit entirely
  - Content-based file fingerprint (async SHA-256 of PDF bytes), falls back to URL hash on fetch failure
  - Daily cache eviction via `browser.alarms` (30-day TTL)
  - New `pdf_translate_unlimited` entitlement feature key registered in contract + extension schemas

- [#93](https://github.com/iannoying/getu-translate/pull/93) [`f38e702`](https://github.com/iannoying/getu-translate/commit/f38e7022e604a81a4ba93bfa233f236c48839a30) Thanks [@iannoying](https://github.com/iannoying)! - feat: M3 PR#C — Pro export + Free watermark + options completion

  - Pro: "Download bilingual PDF" button → `pdf-lib` rewrites original PDF
    with translated paragraph annotations; Noto Sans CJK SC subset lazy-loaded
    (file is a documented manual drop-in; README in `public/assets/fonts/`)
  - Free: viewer watermark "Translated by GetU — Upgrade to remove"; click
    opens `UpgradeDialog` with `source="pdf-translation-watermark"`
  - `showPdfUpgradeDialogAtom` refactored to `{open, source}` for attribution
  - Options → PDF Translation: today's usage badge + cache size + clear-cache
  - Full i18n across 8 locales (English real text; others English + TODO)
  - New `pdf_translate_export` entitlement feature key
  - B3 follow-ups: `retroEnqueueRef` respects `quotaExhaustedRef` (pure
    `runRetroEnqueue` helper with unit tests); `evictStaleConfigRows` sweeps
    orphaned cache rows on config change (target-lang / provider switch)

- [#105](https://github.com/iannoying/getu-translate/pull/105) [`f8603bc`](https://github.com/iannoying/getu-translate/commit/f8603bc34b13d367b4639690cbff24ead578e1d6) Thanks [@iannoying](https://github.com/iannoying)! - refactor(subtitles): extract PlatformRegistry for multi-platform dispatch

  Zero-behavior-change refactor that introduces a `PlatformRegistry` in the
  subtitles content script. YouTube is now registered as one platform handler
  instead of being hardcoded into `runtime.ts`. Subsequent PRs (M4.1 Bilibili,
  M4.2 TED, M4.3 X) will each register their own handler — no further runtime
  changes needed.

- [#108](https://github.com/iannoying/getu-translate/pull/108) [`5666c73`](https://github.com/iannoying/getu-translate/commit/5666c733d1ae04e94786ff88661c14a6418f40c3) Thanks [@iannoying](https://github.com/iannoying)! - feat(subtitles): Bilibili video subtitle translation

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

- [#109](https://github.com/iannoying/getu-translate/pull/109) [`57713db`](https://github.com/iannoying/getu-translate/commit/57713dbf2e4522e39d83efa746b4c173c96e34c2) Thanks [@iannoying](https://github.com/iannoying)! - feat(subtitles): TED talk subtitle translation

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

- [#110](https://github.com/iannoying/getu-translate/pull/110) [`fabaf07`](https://github.com/iannoying/getu-translate/commit/fabaf070a475144776d7220c8381198b62f73c3a) Thanks [@iannoying](https://github.com/iannoying)! - feat(subtitles): X / Twitter video subtitle translation

  Final PR of the M4 video subtitles milestone (follows [#105](https://github.com/iannoying/getu-translate/issues/105) M4.0 registry,
  [#108](https://github.com/iannoying/getu-translate/issues/108) M4.1 Bilibili, [#109](https://github.com/iannoying/getu-translate/issues/109) M4.2 TED). Adds captions translation for X / Twitter
  status pages (twitter.com/{user}/status/{id} and x.com equivalent).

  - Reads captions from `HTMLVideoElement.textTracks` (X has no public caption API)
  - Most X videos have no captions — fetcher returns empty gracefully
  - SPA navigation via history pushState monkey-patch + popstate
  - Host permissions: `*.twitter.com`, `*.x.com`

  Out of scope: HLS manifest VTT parsing, Twitter Spaces, Grok video embeds,
  timeline auto-play videos.

- [`a49ab27`](https://github.com/iannoying/getu-translate/commit/a49ab2790bbb39112d67c08a1c8c5f8b22e4a1c8) Thanks [@taiiiyang](https://github.com/taiiiyang)! - fix(subtitles): stabilize YouTube subtitle navigation and popup mounting

- [#150](https://github.com/iannoying/getu-translate/pull/150) [`beeeba7`](https://github.com/iannoying/getu-translate/commit/beeeba710e62f828a4dce9fa0617660600641164) Thanks [@iannoying](https://github.com/iannoying)! - Stop opening the uninstall survey page when the extension is removed.

- [`0f6bf63`](https://github.com/iannoying/getu-translate/commit/0f6bf631ad61088f9c2c8fc27517754ef3dfe565) Thanks [@frogGuaGuaGuaGua](https://github.com/frogGuaGuaGuaGua)! - chore(deps): upgrade WXT to 0.20.22 and preserve extension-safe bundle output

- [`fb1937c`](https://github.com/iannoying/getu-translate/commit/fb1937c437bcba8ae1eacb181f367e61cc26c3db) Thanks [@yioulii](https://github.com/yioulii)! - fix: floating button style
