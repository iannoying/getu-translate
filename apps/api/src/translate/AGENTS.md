<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-08 -->

# translate

## Purpose

Provider dispatch and LLM integration layer for the `@getu/api` Worker's translation endpoints. Shared by the `/orpc/translate` text endpoint and the document-translation queue consumer (`queue/translate-document.ts`). Contains free-provider adapters (Google `gtx`, Microsoft Edge), the bianxie.ai OpenAI-compatible LLM integration, and the PDF upload/SSRF-guarded `from-url` Hono routes — all unified behind a single `dispatchTranslate` entry point with `TranslateProviderError` as the canonical failure type.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatch.ts`             | `dispatchTranslate(modelId, text, source, target, env)` — top-level router: `google` / `microsoft` → free providers; LLM kind → `bianxieLlmTranslate`. Returns `{text, tokens}` (tokens `null` for free providers). The `meta.kind !== "llm"` branch is intentionally unreachable today — kept as a compile-time safety net for new model kinds. |
| `llm-providers.ts`        | `bianxieLlmTranslate` — OpenAI-compatible chat-completion call to bianxie.ai. Maps `TranslateModelId` → bianxie model name via `TRANSLATE_MODEL_TO_BIANXIE` (8 published Pro LLMs). Non-streaming (chunk-level loop). Reads `BIANXIE_API_KEY` + `BIANXIE_BASE_URL` from `BianxieLlmEnv`. Throws `TranslateProviderError` on network / non-2xx / invalid-JSON / missing `choices[0].message.content` / missing `usage.{prompt,completion}_tokens`. |
| `free-providers.ts`       | `googleTranslate` (Google `gtx` client) + `microsoftTranslate` (Edge translator). Microsoft auth token is JWT-cached at module scope with a 60s safety margin and a single-flight `_msTokenInflight` promise so an 11-column /translate burst fires one auth call, not eleven. JWT `exp` parsed from the token; falls back to 55min if missing. `TranslateProviderError` (with optional `statusCode`) is defined here and used by all providers. `_resetMicrosoftTokenCache()` is test-only. |
| `document-translators.ts` | `makeTranslateChunkFn(env)` — factory returning a `TranslateChunkFn` that wires `dispatchTranslate` into the document pipeline's chunk callback. AbortSignal is plumbed through but currently unused (provider calls have no abort support yet).                                                          |
| `document-pipeline.ts`    | Orchestrates chunked document translation: splits, translates in parallel (bounded concurrency), reassembles. Defines the `TranslateChunkFn` type and pipeline status hooks consumed by the queue heartbeat.                                                                                              |
| `document-chunker.ts`     | Splits translated documents into chunks that fit provider limits. Defines the `Chunk` type.                                                                                                                                                                                                               |
| `document-output.ts`      | Reassembles translated chunks back into the bilingual output document (HTML / Markdown writers).                                                                                                                                                                                                          |
| `document.ts`             | Hono routes for the M6.8 PDF pipeline: `POST /api/translate/document/presign` (R2 S3-style PUT URL, 5-min window) and `POST /api/translate/document/from-url` (SSRF-guarded fetch + R2 stream + INSERT + enqueue). Both require an authenticated session; presign delegates job creation to the `translate.document.create` oRPC procedure. Free retention 30d, Pro retention 90d. |
| `pdf-extract.ts`          | Extracts plain text from PDF binary (via `unpdf`) for pre-processing before translation.                                                                                                                                                                                                                  |

## Subdirectories

| Directory    | Purpose                                                          |
| ------------ | ---------------------------------------------------------------- |
| `__tests__/` | Vitest unit tests for dispatch, providers, and document pipeline |

## For AI Agents

### Working In This Directory

- **Adding a new LLM provider**: add an entry to `TRANSLATE_MODEL_TO_BIANXIE` in `llm-providers.ts` (or, for a non-bianxie endpoint, create a new provider module and add a branch in `dispatch.ts`). Token-cost coefficients live in `TRANSLATE_MODEL_BY_ID` in `@getu/definitions` — keep them decoupled from the contract's `AI_MODEL_COEFFICIENTS` (which is for the extension proxy).
- **`coder-claude-4.7-opus`** is intentionally absent from `TRANSLATE_MODEL_TO_BIANXIE` — bianxie hasn't published it yet. The /translate UI surfaces `PROVIDER_FAILED` for that card; add the entry when bianxie publishes the model.
- `dispatchTranslate` is used by **both** the text endpoint (`orpc/translate/text.ts`) and the document queue consumer — changes here affect both paths. There is no streaming path; the document pipeline calls dispatch once per chunk.
- `TranslateProviderError` is the canonical error class. Always throw it (never a plain `Error`) from provider code so the caller's `PROVIDER_FAILED` wrapping path triggers and the per-card UI isolates the failure.
- Token usage (`tokens: {input, output}`) is returned for LLM calls and `null` for free providers — the billing layer (`billing/quota.ts`) uses this to record usage and apply model coefficients.
- **PDF routes (`document.ts`)**: `from-url` does an SSRF-guard string check (private/loopback/link-local hostnames) plus `redirect: "manual"` and a content-type check, because Workers have no DNS resolver to detect rebinding. Cloudflare's outbound egress already blocks RFC1918 — the in-Worker check is defense-in-depth.

### Testing Requirements

- Mock `fetch` (via the `fetchImpl` parameter) for `bianxieLlmTranslate` tests. Cover: success, non-2xx HTTP, malformed JSON, missing `choices`, missing `usage`, missing model entry.
- Microsoft tests **must** call `_resetMicrosoftTokenCache()` in `beforeEach` — the JWT cache is module-level and leaks across tests.
- `dispatch.ts` tests: verify the correct provider is called for each model kind and that unknown models bubble `TranslateProviderError`.
- Document pipeline tests: verify chunking, parallel translation, and reassembly. The fixtures live under `__tests__/fixtures/` (`hello-world.pdf`, `scanned-image.pdf`).

### Common Patterns

- Provider functions accept a `fetchImpl` parameter (defaulting to `fetch`) to enable network-free unit tests.
- `TranslateProviderError` carries an optional `statusCode` for HTTP-level failures — propagate it into the 5xx response when surfacing the error.
- Model metadata (kind, coefficient, displayName) comes from `TRANSLATE_MODEL_BY_ID` in `@getu/definitions` — never hardcode model properties in this directory.
- Module-level token caches (Microsoft) are acceptable inside Workers because each isolate is short-lived; the singleflight pattern (`_msTokenInflight`) prevents thundering herd on cold starts.

## Dependencies

### Internal

- `@getu/definitions` — `TranslateModelId`, `TRANSLATE_MODEL_BY_ID`, `TRANSLATE_MODELS`.

### External

- `@cloudflare/workers-types` (via `env.ts` — no direct import needed in most files).

<!-- MANUAL: -->
