<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# content

## Purpose

Page-level content extraction and analysis used by content scripts before any translation runs. Pulls article-quality text out of the live DOM via `@mozilla/readability`, detects the article's language (franc + optional LLM fallback), generates a 2-3 sentence summary for prompt context, and exposes small helpers for favicon, RTL/`lang` mapping, and text cleaning.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `analyze.ts`            | `getDocumentInfo()` — clones `document`, strips dont-translate elements via `removeDummyNodes`, runs `Readability`, flattens content into paragraphs (`flattenToParagraphs`), then calls `detectLanguageWithSource` (LLM only when user has configured auto-translate or skip languages — gated to avoid wasteful LLM calls). Returns `{ article, paragraphs, detectedCodeOrUnd, detectionSource }`. |
| `language.ts`           | `detectLanguageWithSource(text, opts)` + `detectLanguage` + `detectLanguageWithLLM` — franc-first with optional LLM (3 attempts, parsed via `parseDetectedLanguageCode`). LLM provider resolved from `config.languageDetection.providerId`. Toasts a one-shot fallback warning on LLM failure.                                                                                                       |
| `language-direction.ts` | `getLanguageDirectionAndLang(targetCode)` — returns `{ dir: 'ltr'                                                                                                                                                                                                                                                                                                                                    | 'rtl', lang? }`from`RTL_LANG_CODES`+`ISO6393_TO_6391`. |
| `summary.ts`            | `generateArticleSummary(title, textContent, providerConfig)` — `cleanText` + Vercel AI SDK `generateText` with a "2-3 sentences, return ONLY the summary" prompt. Returns `null` on empty/error.                                                                                                                                                                                                     |
| `utils.ts`              | `MAX_TEXT_LENGTH = 3000`, `cleanText(text, maxLength?)` (strips zero-width chars + collapses whitespace + truncates), `removeDummyNodes(root)` (uses `isDontWalkIntoAndDontTranslateAsChildElement`).                                                                                                                                                                                                |
| `favicon.ts`            | `getFaviconUrl()` — picks the largest/SVG/PNG icon from `<link rel="…">` candidates, falls back to `/favicon.ico`.                                                                                                                                                                                                                                                                                   |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Always pass `cleanText` output to LLM prompts.** Zero-width chars and runs of whitespace explode token counts and confuse cheaper models. The default 3000-char cap matches what summaries can reliably handle.
- **`getDocumentInfo` clones the document** so `removeDummyNodes` does not damage the live page. Never apply `removeDummyNodes` to the real `document`.
- The LLM-detection gate (`hasAutoTranslateOrSkip`) is intentional: detecting a page's language is expensive and wasted if no downstream feature consumes it. Preserve this gating when adding new "what language is this page" features.
- `detectLanguage` returns `null` for "und"; `detectLanguageWithSource` returns `"und"` plus a `source`. Use the latter when you need to surface "we guessed" vs. "we know" in UI.
- `generateArticleSummary` already calls `cleanText`; do not pre-clean before passing in or you'll double-strip.
- The favicon helper sorts by size then SVG > PNG > ICO. Do not rewrite the comparator without keeping that priority — the side panel relies on the SVG-first behavior for crisp icons.

### Testing Requirements

- Tests live in `content/__tests__/`. Stub LLM `generateText` via the `ai` SDK mocks; for `detectLanguageWithSource`, control LLM by passing a fixture `providerConfig` (skip live calls when `SKIP_FREE_API=true`).

### Common Patterns

- "franc first, LLM second, fallback to und" — the same retry/parse pattern can be reused for any other lightweight-then-LLM enhancement.

## Dependencies

### Internal

- `@/utils/config/storage` — `getLocalConfig`.
- `@/utils/constants/config` — `DEFAULT_CONFIG`.
- `@/utils/host/dom/filter` — `isHTMLElement`, `isDontWalkIntoAndDontTranslateAsChildElement`.
- `@/utils/logger`, `@/utils/message`, `@/utils/prompts/language-detection`.
- `@/utils/providers/model`, `@/utils/providers/model-id`, `@/utils/providers/options`.
- `@/entrypoints/side.content/utils/article` — `flattenToParagraphs`.

### External

- `@mozilla/readability` — `Readability` parser.
- `franc` — fast probabilistic language ID.
- `ai` — `generateText` for summary.
- `sonner` — fallback warning toast.
- `@read-frog/definitions` — `RTL_LANG_CODES`, `ISO6393_TO_6391`, `LangCodeISO6393`.

<!-- MANUAL: -->
