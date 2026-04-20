<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# edge-tts

## Purpose

Self-contained Microsoft Edge "Read Aloud" TTS client. Reproduces the Edge browser's signed handshake (`generateTranslatorSignature` + `dev.microsofttranslator.com` endpoint) to obtain a short-lived JWT, splits long inputs by UTF-8 byte budget on safe punctuation/entity boundaries, builds escaped SSML, posts to the regional `*.tts.speech.microsoft.com/cognitiveservices/v1` endpoint, retries with jittered backoff on transient failures, concatenates MP3/raw chunks, and tripped-circuit-breaks on a sustained failure rate.

## Key Files

| File                 | Description                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`           | Public barrel exporting `api`, `chunk`, `signature`, `ssml`, `token`, `types`.                                                                                                                                                    |
| `api.ts`             | `synthesizeEdgeTTS` (chunked synth + circuit-breaker integration), `listEdgeTTSVoices`, `getEdgeTTSHealthStatus` (probes feature flag, browser, breaker, endpoint token), and re-exports `filterEdgeTTSVoicesByLocale`.           |
| `synthesize.ts`      | `synthesizeEdgeTTSChunkWithRetry` (status-aware retries: 401/403 invalidates token cache; 429/5xx are retryable) and `combineEdgeTTSAudioChunks` (only safe for MP3/raw output formats — asserts uniformity).                     |
| `endpoint.ts`        | `getEdgeTTSEndpointToken` — caches `EdgeTTSTokenInfo`, decodes JWT `exp` for accurate expiry, refreshes 3 min before expiry, falls back to a stale-but-unexpired token on transient errors.                                       |
| `signature.ts`       | `generateTranslatorSignature` — HMAC-SHA-256 over `<appId><urlencoded host+path><GMT date><uuid>` keyed by base64-decoded secret; output is `appId::sig::date::uuid`.                                                             |
| `ssml.ts`            | `buildSSMLRequest` — XML-escapes voice/rate/pitch/volume/text, strips invalid XML control chars, derives the `xml:lang` from the first two voice segments.                                                                        |
| `chunk.ts`           | `splitTextByUtf8Bytes` — binary-search slice by UTF-8 byte size, then nudge to a soft boundary (CJK/ASCII punctuation, whitespace) and back off across HTML entity boundaries; throws `TEXT_TOO_LONG` past `EDGE_TTS_MAX_CHUNKS`. |
| `circuit-breaker.ts` | Failure window with `EDGE_TTS_CIRCUIT_FAILURE_THRESHOLD` failures inside `EDGE_TTS_CIRCUIT_WINDOW_MS` opens the circuit for `EDGE_TTS_CIRCUIT_OPEN_MS`; `recordEdgeTTSSuccess` resets state.                                      |
| `voices.ts`          | Cached voice-list fetch (`EDGE_TTS_VOICES_CACHE_TTL_MS`, falls back to stale on error) plus `filterEdgeTTSVoicesByLocale`.                                                                                                        |
| `browser.ts`         | `isEdgeTTSBrowserSupported` / `assertEdgeTTSAvailable` — gates the feature on `EDGE_TTS_HTTP_ENABLED` and `import.meta.env.BROWSER ∈ {chrome, edge}`.                                                                             |
| `token.ts`           | Backwards-compat facade (`getEdgeTTSAccessToken`, `getEdgeTTSEndpoint`, `clearEdgeTTSToken`) over `endpoint.ts`.                                                                                                                  |
| `constants.ts`       | All knobs: chunk sizes, retry/circuit-breaker timings, voice cache TTL, user agent, signature app id, defaults overridable via `WXT_EDGE_TTS_*` envs, `EDGE_TTS_HTTP_ENABLED` feature flag.                                       |
| `errors.ts`          | `EdgeTTSError` (code, retryable, status, cause) plus `toEdgeTTSErrorPayload` for serialization to the messaging layer.                                                                                                            |
| `types.ts`           | Voice/request/response/token shapes plus a `zod` `edgeTTSConfigSchema` for runtime validation.                                                                                                                                    |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- The signing flow mirrors the Edge browser's exact request shape. Don't change the header set, signature payload format, or `User-Agent` — Microsoft validates them and any drift triggers 403s.
- The signature secret and `appId` have safe defaults, but each ships `WXT_EDGE_TTS_*` env overrides. If a deployment needs to rotate, change env vars rather than the constants.
- `combineEdgeTTSAudioChunks` only supports concatenation-safe formats (MP3, `raw-*`). Adding e.g. WebM/Opus support requires container-level remuxing and must update `isConcatenationSafeOutputFormat` accordingly.
- Token expiry uses the JWT `exp` claim; the `EDGE_TTS_DEFAULT_TOKEN_TTL_MS` fallback is only for malformed tokens. Don't lower `EDGE_TTS_TOKEN_REFRESH_BEFORE_EXPIRY_MS` below ~1 min — the synth call must not race the refresh.
- `assertEdgeTTSAvailable` is the single chokepoint for browser/feature-flag gating; call it at the top of any new public entry point so callers get consistent `UNSUPPORTED_BROWSER` / `FEATURE_DISABLED` errors.
- The circuit breaker is module-level singleton state. In tests, call `resetEdgeTTSCircuitBreaker()` between cases. Don't try to make it per-instance — TTS is process-global from the user's perspective.
- Add new error codes as `EdgeTTSErrorCode` literals in `@/types/edge-tts`, then map them in `synthesize.ts`/`endpoint.ts`/`voices.ts` rather than inventing strings inline.

### Testing Requirements

- Vitest with co-located `__tests__/`. Most tests stub `fetch`; the chunking and SSML escaping tests are pure.
- `SKIP_FREE_API=true` does not currently apply to this directory — TTS tests use mocked fetch responses. If you add live-net regression tests, gate them behind a similar env flag and document it here.
- Tests must reset module state (`clearEdgeTTSTokenCache`, `clearEdgeTTSVoicesCache`, `resetEdgeTTSCircuitBreaker`) in `beforeEach`/`afterEach`.

### Common Patterns

- Module-level caches with explicit `clear*` helpers: token cache (`endpoint.ts`), voices cache (`voices.ts`), circuit-breaker state (`circuit-breaker.ts`).
- Stale-fallback on transient errors: `getEdgeTTSEndpointToken` returns the unexpired-but-stale token if a refresh fails; `listEdgeTTSVoices` returns the cached list on fetch failure.
- Status-aware retry classification: 401/403 → invalidate token + retryable; 429/5xx → retryable; everything else → terminal `SYNTH_REQUEST_FAILED`.
- All `fetch`/HMAC/SubtleCrypto failures funnel into `EdgeTTSError` with a typed `code` field.

## Dependencies

### Internal

- `@/types/edge-tts` (`EdgeTTSErrorCode`, `EdgeTTSErrorPayload`, `EdgeTTSSynthesizeRequest/Response`, `EdgeTTSHealthStatus`)
- `@/utils/crypto-polyfill` (`getRandomUUID`)

### External

- `zod` — runtime config schema
- Web Platform: `crypto.subtle` (HMAC-SHA-256), `TextEncoder`, `atob`/`btoa`, `fetch`

<!-- MANUAL: -->
