<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# translate

## Purpose

End-to-end translation orchestration for the immersive page-translation feature. Routes per the configured `ProviderConfig` (Google / Microsoft / DeepL / DeepLX / any LLM via Vercel AI SDK), assembles AI-content-aware prompts (page title + Readability-extracted main content + optional summary), enqueues background translation requests with SHA-256 cache keys, walks labelled DOM produced by `dom/traversal.ts`, inserts bilingual or translation-only wrappers (with spinners and shadow-DOM error UI), and applies preset/custom CSS via constructable stylesheets. Also owns auto-translation gating and small-paragraph filtering.

## Key Files

| File                        | Description                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto-translation.ts`       | `shouldEnableAutoTranslation(url, detectedCode, config)` — OR of domain-pattern match (`autoTranslatePatterns`) and language match (`autoTranslateLanguages`).                                                                                                              |
| `execute-translate.ts`      | Provider router: `executeTranslate(text, langConfig, providerConfig, promptResolver, options)` — branches on `isNonAPIProvider` / `isPureAPIProvider` / `isLLMProviderConfig` and calls the matching `api/*` adapter.                                                       |
| `translate-text.ts`         | `translateTextCore` (cache-key hashing + `enqueueTranslateRequest` over the messaging bus), `shouldSkipByLanguage` (LLM-or-franc detection with `MIN_LENGTH_FOR_SKIP_LLM_DETECTION = 10`), `validateTranslationConfigAndToast` (toasts on missing API key / same-language). |
| `translate-variants.ts`     | `translateTextForPage` / `translateTextForPageTitle` / `translateTextForInput` — feature-specific entry points using `FEATURE_PROVIDER_DEFS` to pick the right provider config and apply page-translation skip-language rules.                                              |
| `node-manipulation.ts`      | `removeOrShowNodeTranslation(point, config)` — high-level toggle for click-to-translate at a screen point. Re-exports the public translation surface.                                                                                                                       |
| `text-preparation.ts`       | `prepareTranslationText(value)` — strips zero-width chars (`\u200B-\u200D\uFEFF`) and trims; canonical normalizer used everywhere before hashing.                                                                                                                           |
| `translation-attributes.ts` | `setTranslationDirAndLang(element, config)` — sets `dir`/`lang` on the wrapper from `config.language.targetCode`.                                                                                                                                                           |
| `webpage-content.ts`        | `truncateWebPageContent(text)` capped at `WEB_PAGE_CONTENT_CHAR_LIMIT = 2000` for AI context windows.                                                                                                                                                                       |
| `webpage-context.ts`        | Per-tab cached `getOrCreateWebPageContext()` keyed on `window.location.href`; uses `@mozilla/readability` to extract main content, falls back to `body.textContent`.                                                                                                        |
| `webpage-summary.ts`        | `getOrGenerateWebPageSummary(...)` — gated on `enableAIContentAware && isLLMProviderConfig`; round-trips through the bg `getOrGenerateWebPageSummary` message.                                                                                                              |
| `filter-small-paragraph.ts` | `shouldFilterSmallParagraph` — applies `minCharactersPerNode` and `minWordsPerNode` (locale-aware via `Intl.Segmenter`).                                                                                                                                                    |

## Subdirectories

| Directory | Purpose                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`    | Per-provider translation calls: `ai.ts` (Vercel AI SDK + `<think>` strip), `google.ts`, `microsoft.ts` (Edge auth token), `deepl.ts` (background-fetch path + ZH-HANS/ZH-HANT handling), `deeplx.ts` (`{{apiKey}}` placeholder + `api.deeplx.org` special case). Co-located `__tests__/` includes `free-api.test.ts` which hits real upstream services.           |
| `core/`   | Translation engine: `translation-walker.ts` (recursive walk that respects `PARAGRAPH_ATTRIBUTE`/`BLOCK_ATTRIBUTE`), `translation-modes.ts` (bilingual + translation-only modes with spinner injection and DOM batching), `translation-state.ts` (`translatingNodes` `WeakSet`, `originalContentMap` `Map`, pre-compiled `MARK_ATTRIBUTES_REGEX`).                 |
| `dom/`    | Translation-specific DOM ops: `translation-cleanup.ts` (restore `originalContent` on toggle-off), `translation-insertion.ts` (inline/block insertion + float-flow detection via `FLOAT_WRAP_ATTRIBUTE`), `translation-wrapper.ts` (`findPreviousTranslatedWrapperInside`).                                                                                        |
| `ui/`     | User-facing surface: `decorate-translation.ts` (preset vs custom CSS data-attribute), `spinner.ts` (lightweight Web-Animations spinner + React shadow-host error component on failure), `style-injector.ts` (constructable-stylesheet adoption with Firefox Xray fallback to `<style>`), `translation-utils.ts` (`isNumericContent`, `isForceInlineTranslation`). |

## For AI Agents

### Working In This Directory

- `SKIP_FREE_API=true` MUST be set when running the full Vitest suite — `api/__tests__/free-api.test.ts` calls real `translate.googleapis.com` / Microsoft / DeepLX / DeepL endpoints. CI runs with the flag; local devs only unset it when intentionally doing live-API regression testing.
- The bilingual flow ALWAYS goes through three steps in `core/translation-modes.ts`: (1) optimistic spinner insert via `batchDOMOperation`, (2) `getTranslatedTextAndRemoveSpinner` (which mounts a React shadow-host error component on failure), (3) `insertTranslatedNodeIntoWrapper`. Don't reorder.
- Translation-only mode is destructive: it `innerHTML`-restores `originalContentMap.get(parentElement)` on toggle-off. The `nodes` array reference becomes stale after restore — when re-translating after an existing-wrapper match, re-call `translateNodeTranslationOnlyMode(nodes, ...)` so the function re-queries the regenerated DOM (see the lengthy comment in `translation-modes.ts`).
- Cache key composition lives in `translate-text.ts#buildWebPageHashComponents`. The hash MUST include: prepared text, JSON-stringified providerConfig, source/target codes, system+user prompt for LLMs, the `enableAIContentAware` flag literal, and (when enabled) `webTitle`/first-1000-chars of `webContent`/`webSummary`. Add new context fields via this function so cache invalidation stays sound.
- All translation calls go via `sendMessage('enqueueTranslateRequest', ...)` so the background `RequestQueue`/`BatchQueue` owns retries and rate limits. Pass `maxRetries: 0` to AI SDK calls (see `api/ai.ts`) — never let the SDK retry under the queue.
- `<think>...</think>` reasoning preambles are stripped in `api/ai.ts` via `THINK_TAG_RE = /<\/think>([\s\S]*)/`; if a model emits a different sentinel, extend the regex rather than post-processing at call sites.
- Style injection prefers `adoptedStyleSheets` but probes assignment because Firefox content-script Xray wrappers can lie about support (see the bug links in `ui/style-injector.ts`). Don't simplify the probe.
- Number-only nodes are skipped via `isNumericContent` (in `ui/translation-utils.ts`) before any translation request — preserve this gate to avoid wasting AI calls.

### Testing Requirements

- Vitest with co-located `__tests__/` directories under `api/` and `ui/`.
- `SKIP_FREE_API=true` skips `api/__tests__/free-api.test.ts` (live network). The flag is read at test-setup time; default CI sets it.
- DOM tests use the same happy-dom/jsdom setup as `host/dom/`; spinner/error tests stub the React shadow-host helper.

### Common Patterns

- Two-step normalize-then-hash: `prepareTranslationText` strips invisible characters, then `Sha256Hex(...components)` produces the cache key.
- Optimistic UI then async resolution: insert spinner wrapper synchronously (batched), await translation, swap content or mount error component.
- Provider routing via type guards (`isNonAPIProvider`, `isPureAPIProvider`, `isLLMProviderConfig`) — never branch on the raw `provider` string outside `execute-translate.ts`.
- Per-tab caches keyed on `window.location.href` (`webpage-context.ts`) — invalidated implicitly by URL change.

## Dependencies

### Internal

- `@/types/config/config`, `@/types/config/provider`, `@/types/config/translate`, `@/types/content`, `@/types/dom`
- `@/utils/config/helpers`, `@/utils/config/languages`, `@/utils/config/storage`
- `@/utils/constants/dom-labels`, `@/utils/constants/dom-rules`, `@/utils/constants/feature-providers`, `@/utils/constants/translation-node-style`
- `@/utils/content/language`, `@/utils/content/language-direction`, `@/utils/content/utils`
- `@/utils/host/dom/*` (the low-level DOM toolkit)
- `@/utils/providers/model`, `@/utils/providers/model-id`, `@/utils/providers/options`
- `@/utils/prompts/translate`
- `@/utils/message`, `@/utils/hash`, `@/utils/url`, `@/utils/logger`, `@/utils/error/extract-message`, `@/utils/react-shadow-host/create-shadow-host`
- `@/components/translation/error`
- `@/assets/styles/*`

### External

- `ai` — `generateText`, `APICallError`, `JSONValue`
- `@read-frog/definitions` — `ISO6393_TO_6391`, `LANG_CODE_TO_EN_NAME`, `LANG_CODE_TO_LOCALE_NAME`
- `@mozilla/readability` — main-content extraction
- `case-anything` — `camelCase` for data-attribute keys
- `sonner` — toasts
- `react` — shadow-host error UI

<!-- MANUAL: -->
