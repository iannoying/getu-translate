<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# translate

## Purpose

Provider dispatch and LLM integration layer for the `@getu/api` Worker's translation endpoints. Shared by the `/orpc/translate` text endpoint and the document-translation queue consumer. Contains both free-provider adapters (Google, Microsoft) and the bianxie.ai LLM integration, unified behind a single `dispatchTranslate` entry point.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatch.ts`             | `dispatchTranslate(modelId, text, source, target, env)` — top-level router: google/microsoft → free providers; LLM kind → `bianxieLlmTranslate`. Used by both `orpc/translate/text.ts` and the queue consumer. Returns `{text, tokens}` (`tokens` null for free providers). |
| `llm-providers.ts`        | `bianxieLlmTranslate` — OpenAI-compatible chat-completion call to bianxie.ai. Maps `TranslateModelId` → bianxie model name via `TRANSLATE_MODEL_TO_BIANXIE`. Throws `TranslateProviderError` on network/HTTP/parse failures. Non-streaming (per-chunk pipeline). |
| `document-translators.ts` | `makeTranslateChunkFn(env)` — factory that returns a `TranslateChunkFn` wiring `dispatchTranslate` into the document-translation pipeline's chunk callback interface.                                                                                          |
| `free-providers.ts`       | `googleTranslate` / `microsoftTranslate` — adapters for free translation APIs. Source of `TranslateProviderError` class used across the module.                                                                                                               |
| `document-pipeline.ts`    | Orchestrates chunked document translation: splits, translates in parallel (bounded concurrency), and reassembles. Defines the `TranslateChunkFn` type.                                                                                                        |
| `document-chunker.ts`     | Splits translated documents into chunks that fit provider limits. Defines the `Chunk` type.                                                                                                                                                                   |
| `document-output.ts`      | Reassembles translated chunks back into the output document format.                                                                                                                                                                                           |
| `document.ts`             | Entry point for document translation jobs — called by the queue consumer in `queue/translate-document.ts`.                                                                                                                                                    |
| `pdf-extract.ts`          | Extracts plain text from PDF binary for pre-processing before translation.                                                                                                                                                                                    |

## Subdirectories

| Directory    | Purpose                                           |
| ------------ | ------------------------------------------------- |
| `__tests__/` | Vitest unit tests for dispatch, providers, and document pipeline |

## For AI Agents

### Working In This Directory

- **Adding a new LLM provider**: add an entry to `TRANSLATE_MODEL_TO_BIANXIE` in `llm-providers.ts` (or create a new provider file following the same pattern and add a branch in `dispatch.ts`).
- **`coder-claude-4.7-opus`** is intentionally absent from `TRANSLATE_MODEL_TO_BIANXIE` — bianxie hasn't published it yet. The UI surfaces `PROVIDER_FAILED` for that card. Add the entry when bianxie publishes it.
- `dispatchTranslate` is used by **both** the text endpoint and the document queue — changes here affect both paths.
- `TranslateProviderError` is the canonical error class for provider failures; callers wrap it in `PROVIDER_FAILED` response shape. Always throw it (not a plain `Error`) from provider code so the caller's wrapping path triggers.
- Token usage (`tokens: {input, output}`) is returned for LLM calls and is `null` for free providers — the billing layer uses this to record usage.

### Testing Requirements

- Mock `fetch` (or `fetchImpl` parameter) for `bianxieLlmTranslate` tests. Cover: successful response, non-2xx HTTP, malformed JSON, missing `choices`, missing `usage`.
- `dispatch.ts` tests: verify correct provider is called for each model kind.
- Document pipeline tests: verify chunking, parallel translation, and reassembly.

### Common Patterns

- Provider functions accept a `fetchImpl` parameter (default `fetch`) to enable unit testing without network.
- `TranslateProviderError` carries an optional `statusCode` for HTTP-level failures — propagate it to the 500/502 response.
- Model metadata (kind, coefficient) comes from `TRANSLATE_MODEL_BY_ID` in `@getu/definitions` — never hardcode model properties here.

## Dependencies

### Internal

- `@getu/definitions` — `TranslateModelId`, `TRANSLATE_MODEL_BY_ID`, `TRANSLATE_MODELS`.

### External

- `@cloudflare/workers-types` (via `env.ts` — no direct import needed in most files).

<!-- MANUAL: -->
