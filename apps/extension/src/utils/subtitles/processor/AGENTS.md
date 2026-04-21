<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# processor

## Purpose

Three independent pipeline stages applied to raw `SubtitlesFragment[]` after a fetcher returns them and before the overlay renders. Each stage is opt-in and orthogonal: `optimizer.ts` deterministically re-segments timing/length without any AI; `ai-segmentation.ts` outsources segmentation to an LLM via a simplified-VTT round-trip; `translator.ts` translates each fragment in parallel with optional video-summary context for the prompt.

## Key Files

| File                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `optimizer.ts`       | `optimizeSubtitles(fragments, language)` — two-pass deterministic re-segmentation. Pass 1 buffers fragments respecting sentence-end punctuation, `PAUSE_TIMEOUT_MS` gaps, max length, and signs (`[`/`(`/`♪`). If quality is poor (>20% lines longer than 250 chars), pass 2 also breaks on PAUSE_WORDS (`actually`, `because`, `however`, …). Final pass `rebalanceToTargetRange` merges short adjacent lines toward CJK 15–25 / non-CJK 11–20 unless boundary is enforced.                                                   |
| `ai-segmentation.ts` | `aiSegmentBlock(fragments, config)` — cleans noise, serializes to compact JSON (`{s, e, t}` triples), sends through `aiSegmentSubtitles` background message, parses returned simplified-VTT (`<startMs> --> <endMs>\n<text>`) back into `SubtitlesFragment[]`; throws on empty result. Also exports `cleanFragmentsForAi`, `formatFragmentsToJson`, `parseSimplifiedVttToFragments`.                                                                                                                                           |
| `translator.ts`      | `translateSubtitles(fragments, videoContext)` — per-fragment `Promise.allSettled` over `enqueueSubtitlesTranslateRequest`. Hash inputs include text, providerConfig, source/target codes, system/user prompt, `enableAIContentAware`, optional `videoTitle`, first-1000-chars of `subtitlesTextContent`, and `videoSummary`. `fetchSubtitlesSummary` (sibling helper) requests an LLM summary via `getSubtitlesSummary` background message. `toFriendlyErrorMessage` maps `APICallError` 429/401/403/5xx to localized strings. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- The optimizer is intentionally NOT aware of language semantics beyond CJK/non-CJK length math (`@/utils/subtitles/utils`). If you need linguistic segmentation, route through `ai-segmentation.ts` instead — that's its purpose.
- AI segmentation uses a simplified VTT contract (millisecond integers, `-->` separator, blank-line-separated cues). The parser tolerates extra whitespace but expects `\d+\s*-->\s*\d+`. Do not change the contract without updating both the prompt template (`@/utils/prompts/...`) and `parseSimplifiedVttToFragments`.
- Translation hash composition in `buildSubtitleHashComponents` MUST stay in lockstep with `host/translate/translate-text.ts#buildWebPageHashComponents` — both feed into the same background cache (`articleSummaryCache` / `translationCache`). New context fields go through normalize → push → hash, never inline at call sites.
- All three stages are pure transforms over `SubtitlesFragment[]`. Don't introduce module-level state; cache decisions live in the bg cache layer (`db/dexie`).
- `Promise.allSettled` in `translateSubtitles` keeps partial successes; if every translation rejects, throw a friendly error from the first rejection so the overlay can render an inline error.
- `fetchSubtitlesSummary` early-returns `null` when the provider isn't an LLM or the user disabled AI-content-aware — don't add fallback logic that would defeat that gate.

### Testing Requirements

- Vitest with co-located `__tests__/`. Optimizer tests cover sentence-end vs pause-word vs timeout boundary triggers and the rebalance pass. AI-segmentation tests cover `parseSimplifiedVttToFragments` edge cases (missing header, blank lines, malformed timestamps).
- No live network — all background messages are mocked.

### Common Patterns

- Append-only buffer + `flushBuffer()` pattern in `optimizer.ts`.
- Compact JSON wire format (`{s, e, t}`) for AI-segmentation prompts to fit more fragments per token budget.
- Per-fragment translation via `Promise.allSettled` so one bad fragment doesn't block the rest.
- Friendly-error mapping concentrated in one helper (`toFriendlyErrorMessage`) per stage.

## Dependencies

### Internal

- `@/utils/subtitles/types`, `@/utils/subtitles/utils`
- `@/types/config/config`, `@/types/config/provider`, `@/types/content`
- `@/utils/config/helpers`, `@/utils/config/storage`
- `@/utils/constants/subtitles` (`PAUSE_TIMEOUT_MS`, `SENTENCE_END_PATTERN`)
- `@/utils/content/utils` (`cleanText`)
- `@/utils/host/translate/text-preparation`, `@/utils/host/translate/translate-text` (`normalizePromptContextValue`)
- `@/utils/hash`, `@/utils/message`, `@/utils/prompts/subtitles`

### External

- `#imports` from WXT — `i18n`
- `ai` — `APICallError` (status-code dispatch)
- `@read-frog/definitions` — `LANG_CODE_TO_EN_NAME` for prompt language naming

<!-- MANUAL: -->
