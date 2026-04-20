<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# hooks

## Purpose

Cross-cutting React hooks shared by popup, options, side panel, content scripts, and selection toolbar UI. These wrap React-Query mutations/queries, WXT storage watchers, Jotai atoms, browser APIs (matchMedia), background-script messaging, and Edge TTS playback so feature components can stay declarative. Auto-imports are disabled, so each hook is explicitly imported via `@/hooks/...`.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-batch-request-record.ts` | Loads daily translation request records via `@tanstack/react-query` `useQueries` for fixed look-back windows (5/7/30/60 days) and exposes both current and previous-period slices for trend deltas.                                                                                                                          |
| `use-debounced-value.ts`      | Generic `useDebouncedValue<T>(value, delay)` hook implemented with `setTimeout` + `useState`; used to debounce user input before triggering expensive work.                                                                                                                                                                  |
| `use-export-config.ts`        | `useMutation` that serializes the current `Config` (optionally stripped of API keys via `getObjectWithoutAPIKeys`) to JSON, downloads it via `file-saver` as `read-frog-config-v<schemaVersion>.json`, and toasts via `sonner` + `i18n.t`.                                                                                   |
| `use-google-drive-auth.ts`    | React-Query backed Google Drive auth state (`isAuthenticated` + `userInfo`) that auto-invalidates whenever `GOOGLE_DRIVE_TOKEN_STORAGE_KEY` changes via `storage.watch`.                                                                                                                                                     |
| `use-mobile.ts`               | `useIsMobile()` breakpoint hook (768px) using `window.matchMedia`; returns `false` on the SSR-undefined first render.                                                                                                                                                                                                        |
| `use-text-to-speech.tsx`      | Heavyweight TTS orchestration hook: chunks text by UTF-8 bytes, resolves voice from `TTSConfig` + detected language, prefetches the next chunk while the current chunk plays in the offscreen document, supports cancellation via `requestId`, and emits analytics + friendly error toasts. Exports `selectTTSVoice` helper. |
| `use-unresolved-field.ts`     | Wraps Jotai atoms (`diffConflictsResultAtom`, `resolutionsAtom`) to expose a per-path-key conflict resolution API (`selectLocal` / `selectRemote` / `reset`) for the Google Drive sync conflict UI.                                                                                                                          |

## Subdirectories

| Directory    | Purpose                                                     |
| ------------ | ----------------------------------------------------------- |
| `__tests__/` | Vitest specs covering the hooks (skipped per instructions). |

## For AI Agents

### Working In This Directory

- Auto-imports are OFF — every React, Jotai, React-Query, WXT (`#imports`), and util import must be written explicitly.
- All async work should funnel through `@tanstack/react-query` (`useQuery` / `useMutation` / `useQueries`); set `meta: { suppressToast: true }` when you handle errors yourself to opt out of the global error toast.
- Use `i18n.t(...)` from `#imports` for any user-visible string and never hardcode English copy.
- Cross-context I/O goes through `sendMessage` from `@/utils/message` (typed via `webext-bridge`); long-running work like TTS playback uses an `activeRequestIdRef` + `ttsPlaybackStop` cancellation pattern — preserve it when refactoring.
- Storage watchers must use `storage.watch('local:<KEY>', ...)` from `#imports` and return the disposer from `useEffect` so popup/options never leak listeners.
- Read config through `useAtomValue(configFieldsAtomMap.<field>)` instead of pulling the whole config — the field atoms are designed for narrow re-renders.

### Testing Requirements

Vitest specs live in `src/hooks/__tests__/` co-located with the hooks. Use `@testing-library/react` `renderHook` and mock `#imports` (`storage`, `i18n`, `sendMessage`) in setup.

### Common Patterns

- React-Query keys are tuples like `["google-drive-auth"]` or `["tts-audio", { voice, rate, ... }]`; reuse the constant `QUERY_KEY` pattern when invalidating.
- Hooks expose primitive booleans (`isPlaying`, `isFetching`) plus action callbacks (`play`, `stop`) rather than returning the raw mutation, keeping consumers decoupled from React-Query internals.
- Friendly error mapping (e.g. `getTTSFriendlyErrorDescription`) translates internal error codes into user-facing strings before toasting.

## Dependencies

### Internal

- `@/utils/atoms/config` and `@/utils/atoms/google-drive-sync` for Jotai field atoms
- `@/utils/batch-request-record`, `@/utils/google-drive/*`, `@/utils/server/edge-tts/chunk`
- `@/utils/message` (typed background bridge), `@/utils/analytics`, `@/utils/logger`, `@/utils/crypto-polyfill`
- `@/utils/config/api`, `@/utils/constants/{app,config}`
- `@/types/{analytics,config/tts}`

### External

- `@tanstack/react-query` — query/mutation/queries primitives
- `jotai` — `useAtomValue` / `useSetAtom` for shared state
- `sonner` — toast notifications
- `file-saver` + `case-anything` — exporting JSON config files
- `#imports` (WXT virtual module) — `storage`, `i18n`, `Browser` types

<!-- MANUAL: -->
