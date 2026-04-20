<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# prompts

## Purpose

All prompt builders for Read Frog's LLM features — page translation, subtitle translation, AI subtitle segmentation, article analysis, sentence/paragraph explanation, single-word/phrase explanation, and language detection. Each builder reads the user's `customPromptsConfig` from local config (when applicable), resolves the active prompt template (built-in default if no `promptId` is set), and replaces `{{token}}` cells with runtime values (target language, input text, web/video title + summary, etc.). Centralizing the templating logic here means feature code never builds prompts inline.

## Key Files

| File                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translate.ts`              | `getTranslatePromptFromConfig(translateConfig, targetLang, input, options)` + `getTranslatePrompt(...)` — picks default vs. custom `(systemPrompt, prompt)` from `config.translate.customPromptsConfig`, appends `DEFAULT_BATCH_TRANSLATE_PROMPT` when `isBatch`, then `replaceTokens` for `TARGET_LANGUAGE`/`INPUT`/`WEB_TITLE`/`WEB_CONTENT`/`WEB_SUMMARY`. Exports `resolvePromptReplacementValue` shared with subtitles. |
| `subtitles.ts`              | `getSubtitlesTranslatePrompt(targetLang, input, options)` — same flow as `translate.ts` but reads `config.videoSubtitles.customPromptsConfig`, defaults to `DEFAULT_SUBTITLE_TRANSLATE_SYSTEM_PROMPT`, replaces `VIDEO_TITLE`/`VIDEO_SUMMARY`.                                                                                                                                                                               |
| `subtitles-segmentation.ts` | `getSubtitlesSegmentationPrompt(jsonContent)` — non-customizable wrapper around `DEFAULT_SUBTITLES_SEGMENTATION_SYSTEM_PROMPT` + `DEFAULT_SUBTITLES_SEGMENTATION_PROMPT`, only replaces `INPUT`.                                                                                                                                                                                                                             |
| `analyze.ts`                | `getAnalyzePrompt(targetLang)` — long template-literal prompt that asks the LLM to classify "is this an article?", detect language, summarize in detected language, write a target-language introduction, and list specialized terms. Embeds `LANG_CODE_TO_EN_NAME` + 4 worked examples. Output is JSON.                                                                                                                     |
| `explain.ts`                | `getExplainPrompt(sourceLang, targetLang, langLevel)` — paragraph-by-paragraph explanation prompt for the side panel. Each sentence yields original / translated / important words (`syntacticCategory` from `syntacticCategoryAbbr`) / explanation. Includes Chinese↔Japanese same-shape opt-out.                                                                                                                           |
| `word-explain.ts`           | `getWordExplainPrompt(sourceLang, targetLang, langLevel)` — selection-toolbar dictionary prompt. Picks `word-template` vs. `sentence-template` and uses `LANG_DICTIONARY_LABELS[lang]` so labels (`Definition`, `Synonyms`, …) render in the user's UI language.                                                                                                                                                             |
| `language-detection.ts`     | `getLanguageDetectionSystemPrompt()` (lists all supported ISO 639-3 codes from `LANG_CODE_TO_EN_NAME`), `normalizeLanguageDetectionOutput`, `parseDetectedLanguageCode` (Zod-validated against `langCodeISO6393Schema or 'und'`).                                                                                                                                                                                            |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Token replacement uses `getTokenCellText(name)` → `{{name}}`.** Never hand-write `{{…}}` strings — go through the constants in `@/utils/constants/prompt` so renaming a token only touches one place.
- **Always honor `customPromptsConfig.promptId`.** The pattern is: fall back to the constants when `promptId` is absent OR when no matching pattern exists. Stripping that fallback breaks users who reference now-deleted custom prompts.
- **`isBatch` only modifies the system prompt** (appends `DEFAULT_BATCH_TRANSLATE_PROMPT` so the model knows to produce `%%`-separated output). Never inject batching rules into the user prompt.
- **Empty / missing context fields default through `resolvePromptReplacementValue`** to literal strings like `"No title available"` so the model's prompt is never left with a stray `{{webTitle}}`. Reuse this helper for new tokens.
- The analyze / explain / word-explain prompts include worked examples in the system prompt — these are not free; they're the floor for output quality on small models. Don't shrink them without re-running the eval set.
- Prompts return strings; do **not** call `generateText` from this directory. Building and calling the model are separate concerns (callers in `entrypoints/*` and `utils/server/*` invoke the model with the returned `system + prompt`).

### Testing Requirements

- Tests live in `prompts/__tests__/`. Snapshot the rendered prompts for representative configs to catch unintended template drift.

### Common Patterns

- "Resolve template from config-or-default → append batch-rules-if-needed → replaceAll tokens" — the same shape across `translate.ts` and `subtitles.ts`. New "translate-like" features should follow it.

## Dependencies

### Internal

- `@/types/config/config` — `Config["translate"]`.
- `@/types/content` — `WebPagePromptContext`, `SubtitlePromptContext`, `syntacticCategoryAbbr`.
- `@/utils/config/storage` — `getLocalConfig`.
- `@/utils/constants/config` — `DEFAULT_CONFIG`.
- `@/utils/constants/prompt` — every token name + default prompt string + `getTokenCellText`.

### External

- `@read-frog/definitions` — `LangCodeISO6393`, `LangLevel`, `LANG_CODE_TO_EN_NAME`, `LANG_DICTIONARY_LABELS`, `langCodeISO6393Schema`.
- `zod` — used to validate detected-language output.

<!-- MANUAL: -->
