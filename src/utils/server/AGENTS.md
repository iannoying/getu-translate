<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# server

## Purpose

Namespace for "server-style" features that the extension hosts inside the browser process — i.e. flows that emulate or call backend services directly from the extension (background script, content script, or popup) without a real Read Frog server. Currently houses the Microsoft Edge text-to-speech client.

## Key Files

This directory has no top-level files — only subdirectories.

## Subdirectories

| Directory   | Purpose                                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edge-tts/` | Microsoft Edge online TTS client: signature/JWT-token auth, SSML synthesis with byte-accurate chunking, voice-list caching, retries, and a circuit breaker (see `edge-tts/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Add new server-style integrations (alternate TTS providers, hosted RAG, etc.) as sibling subdirectories — keep each integration self-contained with its own `index.ts` barrel, types, errors, and constants.
- Anything browser-process-only (auth via fetch, public endpoints with weak gating) belongs here. Anything that requires Read Frog credentials should NOT live in this directory; it belongs near the orpc / auth modules.
- Feature flags for these integrations are read from `import.meta.env.WXT_*` constants — keep them centralised in the integration's own `constants.ts`.

### Testing Requirements

- Vitest, with the actual `__tests__/` co-located inside each integration subdirectory.
- These integrations may make real network calls; if you add live-net tests, follow the existing `SKIP_FREE_API`-style env-flag pattern used elsewhere in the repo.

### Common Patterns

- Each subdirectory exports a single facade (`index.ts`) and keeps wire details (signatures, SSML, error mapping) private.
- Caching, retries, and circuit-breaking live next to the call site, not in shared utilities.

## Dependencies

### Internal

- Re-exports from subdirectories.

### External

- None directly at this level.

<!-- MANUAL: -->
