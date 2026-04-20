<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# subtitles

## Purpose

End-to-end pipeline for the in-page subtitle overlay: per-platform fetcher abstraction, language-aware text length math (CJK character count vs. non-CJK word count), display-mode rules, SRT export, and typed error classes. The `processor/` subdirectory wraps optimization, AI segmentation, and translation; `fetchers/` adapts each video platform; `video-id/` resolves the current platform's video id from the URL.

## Key Files

| File               | Description                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `types.ts`         | `SubtitlesState` (`'idle'                                                                                                                                                        | 'loading'                                                                                   | 'error'`), `StateData`, and the canonical `SubtitlesFragment { text, start, end, translation? }` shape. |
| `errors.ts`        | `SubtitlesError` base + `ToastSubtitlesError` (surface as toast) and `OverlaySubtitlesError` (surface inline in the overlay). The class decides where the error message renders. |
| `srt.ts`           | `formatSrtTimestamp`, `buildSubtitlesSrtContent`, `buildSubtitlesSrtFilename`, `downloadSubtitlesAsSrt` — sanitizes filenames (`< > : " / \                                      | ? \*`, control chars, trailing dots/spaces) and clamps to 80 chars; saves via `file-saver`. |
| `utils.ts`         | `isCJKLanguage(lang)` (zh/ja/ko/th/lo/km/my prefix match), `getTextLength` (chars for CJK, word-split for others), `getMaxLength` (returns `MAX_CHARS_CJK`/`MAX_WORDS`).         |
| `display-rules.ts` | `hasRenderableSubtitleByMode(subtitle, displayMode)` and `isAwaitingTranslation(subtitle, stateData)` — pure predicates the React overlay uses to decide what to paint.          |

## Subdirectories

| Directory    | Purpose                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchers/`  | Per-platform `SubtitlesFetcher` implementations (currently YouTube). See `fetchers/AGENTS.md`.                                                                                                                                                           |
| `processor/` | Pipeline stages: `optimizer.ts` (sentence/length-balanced re-segmentation), `ai-segmentation.ts` (LLM-driven re-segmentation via simplified VTT round-trip), `translator.ts` (per-fragment translation with summary context). See `processor/AGENTS.md`. |
| `video-id/`  | URL-driven video-id resolution per platform. See `video-id/AGENTS.md`.                                                                                                                                                                                   |

## For AI Agents

### Working In This Directory

- The `SubtitlesFragment` shape is the canonical interchange between fetchers, the optimizer, the AI segmenter, the translator, and the React overlay. Don't widen it casually — every consumer assumes `start`/`end` are integer milliseconds.
- CJK vs. non-CJK length math is centralised in `utils.ts`. Don't compute `text.split(' ').length` ad-hoc in subtitle code; route through `getTextLength` so CJK behavior is consistent.
- `errors.ts` distinguishes toast errors from overlay-inline errors by class, not by a status code. Pick the class deliberately — `ToastSubtitlesError` blocks rendering with a notification, `OverlaySubtitlesError` renders inside the overlay frame.
- SRT filenames flow through `sanitizeFilenamePart` which strips control chars, normalizes whitespace, removes trailing dots/spaces, and slices to 80 chars. Don't sanitize twice.

### Testing Requirements

- Vitest with co-located `__tests__/` (under `processor/__tests__/` and others).
- No live-net dependencies in this folder directly. The translator pathway calls into background messaging (`sendMessage('enqueueSubtitlesTranslateRequest', ...)`) which respects the same provider config used by page translation.

### Common Patterns

- Module barrels for type re-exports (`fetchers/index.ts` re-exports `./types`).
- All multi-character pattern constants are pre-compiled (`SENTENCE_END_PATTERN`, `LINE_BREAK_PATTERN`, etc.) at module top-level.
- Pure predicate helpers for UI decisions (`display-rules.ts`) — keep React components free of timing/lang logic.

## Dependencies

### Internal

- `@/types/config/config`, `@/types/config/subtitles`, `@/types/config/provider`, `@/types/content`
- `@/utils/config/storage`, `@/utils/config/helpers`
- `@/utils/constants/subtitles` (`MAX_CHARS_CJK`, `MAX_WORDS`, `SENTENCE_END_PATTERN`, `PAUSE_TIMEOUT_MS`, fetcher request/response type constants)
- `@/utils/host/translate/text-preparation`, `@/utils/host/translate/translate-text`
- `@/utils/content/utils` (`cleanText`, `removeDummyNodes`)
- `@/utils/hash`, `@/utils/message`, `@/utils/prompts/subtitles`

### External

- `file-saver` — SRT download
- `@read-frog/definitions` — language-name maps for prompts
- `ai` — `APICallError` for status-code-based error mapping (in `processor/translator.ts`)

<!-- MANUAL: -->
