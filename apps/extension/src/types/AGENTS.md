<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# types

## Purpose

Shared TypeScript declarations and Zod schemas used across content scripts, background, popup, and options. The directory mixes pure structural types (DOM, proxy fetch, TTS playback envelopes), runtime-validated Zod schemas (`articleAnalysisSchema`, `translationStateSchema`), constant maps with derived literal types (`ANALYTICS_FEATURE`, `EDGE_TTS_ERROR_CODES`, `BACKGROUND_STREAM_PORTS`), and a TypeScript reset declaration. Subdirectory `config/` holds the user-config Zod schema split by feature.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics.ts`                | `ANALYTICS_FEATURE` / `ANALYTICS_SURFACE` const maps plus `FeatureUsageContext` and `FeatureUsedEventProperties` interfaces consumed by `@/utils/analytics`.                                                                                                                                 |
| `background-generate-text.ts` | Wire types for `background.generateText` request/response (provider id, prompt, temperature, `providerOptions`).                                                                                                                                                                             |
| `background-stream.ts`        | Types for streamed background calls: `BACKGROUND_STREAM_PORTS` channel names, `StreamPortRequestMessage` / `StreamPortResponse` envelopes (`chunk` / `done` / `error`), `BackgroundStreamSnapshot<TOutput>`, and `StreamRuntimeOptions` with abort signal + `onChunk` / `onError` callbacks. |
| `backup.ts`                   | `ConfigBackup`, `ConfigBackupMetadata`, and `ConfigBackupWithMetadata` for Google Drive backup payloads.                                                                                                                                                                                     |
| `content.ts`                  | Content-script article extraction types (`ExtractedContent`) plus Zod schemas `articleAnalysisSchema`, `articleExplanationSchema`, `partOfSpeechAbbr`, and prompt context interfaces (`WebPagePromptContext`, `SubtitlePromptContext`).                                                      |
| `dom.ts`                      | Tiny DOM helpers — `Point` and `TransNode = HTMLElement \| Text`.                                                                                                                                                                                                                            |
| `edge-tts.ts`                 | Edge TTS message envelope types: `EDGE_TTS_ERROR_CODES`, `EdgeTTSSynthesizeRequest/Response`, `EdgeTTSSynthesizeWireResponse` (base64 over the bridge), and `EdgeTTSHealthStatus`.                                                                                                           |
| `proxy-fetch.ts`              | `ProxyRequest` / `ProxyResponse` shapes for the background-side fetch proxy with optional `CacheConfig` (group key + TTL).                                                                                                                                                                   |
| `reset.d.ts`                  | Imports `@total-typescript/ts-reset/array-includes` so `Array.includes` accepts wider types.                                                                                                                                                                                                 |
| `translation-state.ts`        | `translationStateSchema` (`{ enabled: boolean }`) — per-tab translation toggle.                                                                                                                                                                                                              |
| `tts-playback.ts`             | Offscreen-document TTS playback message types: `TTSPlaybackStartRequest/Response`, `TTSPlaybackStopRequest`, and `TTSPlaybackStopReason` (`"stopped" \| "interrupted"`).                                                                                                                     |
| `utils.ts`                    | Generic, dependency-free helpers `pick`, `omit`, and `compactObject` that strips empty-string / null / undefined values.                                                                                                                                                                     |

## Subdirectories

| Directory | Purpose                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/` | User-config Zod schemas, split per feature (provider, translate, tts, subtitles, selection-toolbar, language-detection, theme, meta) and combined into `configSchema` (see `config/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- This directory must stay free of side-effectful code — only types, Zod schemas, and pure helpers. Anything that touches `storage`, `browser`, or `window` belongs in `@/utils/`.
- When you add a new constant set, mirror the `as const` + `(typeof X)[keyof typeof X]` pattern (see `analytics.ts`, `edge-tts.ts`, `background-stream.ts`) so the literal union stays in sync.
- Zod schemas should be defined here only when they describe a public message envelope or persisted shape; per-feature internal schemas live closer to their consumers.
- `reset.d.ts` is referenced by `tsconfig.json` — if you broaden the `ts-reset` imports, double-check the global side-effects don't break call sites.
- For wire formats that cross context boundaries (background ↔ content/popup) prefer base64-encoded `string` payloads over `ArrayBuffer` (see `EdgeTTSSynthesizeWireResponse`) because the WebExtension runtime serializes JSON only.
- Discriminated unions (`StreamPortResponse`, `EdgeTTSSynthesizeResponse`, `TTSPlaybackStartResponse`) are the canonical "ok / error" pattern — keep new wire types consistent with this so callers can `if (res.ok) ...`.

### Testing Requirements

No tests live at this level. The `config/` subdirectory has its own `__tests__/` (Vitest). Add tests beside the schema you're changing if behaviour-bearing.

### Common Patterns

- `as const` + `keyof typeof` to derive string-literal unions from object maps.
- `z.infer<typeof xSchema>` immediately after every Zod schema for type re-export.
- `interface ... extends Record<string, unknown>` for WXT `storage.setMeta` payloads (see `backup.ts`, `config/meta.ts`).
- Distributive `Omit` (`DistributiveOmit` in `background-stream.ts`) when narrowing discriminated unions.

## Dependencies

### Internal

- `@/types/config/*` (sibling cross-imports for `Config`, `SelectionToolbarCustomActionOutputType`)
- `@/utils/server/edge-tts/types` for raw Edge TTS request/voice shapes

### External

- `zod` — runtime schema validation
- `ai` — `JSONValue`, `StreamTextOnErrorCallback` for stream payloads
- `@read-frog/definitions` — language code schemas (`langCodeISO6393Schema`)
- `@total-typescript/ts-reset` — `Array.includes` widening
- `#imports` (WXT) — `Browser.runtime.Port` typing

<!-- MANUAL: -->
