<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# atoms

## Purpose

Jotai atom factories for every piece of cross-context, persisted, or derived state in Read Frog: the full user `Config`, theme mode, detected page language, analytics opt-in, active provider for a feature, content-script translation toggle, Google Drive sync conflict resolution, and last-sync time. Every atom here is the single source of truth for its slice — components/hooks subscribe via `useAtom`/`useAtomValue` and writes always flow back through these atoms (so storage, optimistic UI, and cross-context watch stay consistent).

## Key Files

| File                   | Description                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`            | Top-level `configAtom` + `writeConfigAtom` — optimistic update, serialized write queue, version-check stale-write guard, `visibilitychange` re-load, plus `configFieldsAtomMap` (one selectAtom-backed read/write atom per top-level config key).        |
| `storage-adapter.ts`   | Tiny Zod-validated wrapper around WXT `storage` (`get/set/setMeta/watch`) used by every atom in this folder. Always prefixes with `local:`.                                                                                                              |
| `theme.ts`             | `themeModeAtom` (public r/w through storageAdapter) + `baseThemeModeAtom` (private, exported only for top-level pre-`ThemeProvider` hydration).                                                                                                          |
| `detected-code.ts`     | `detectedCodeAtom` for ISO 639-3 page language; private base atom prevents direct writes — writes always go through storageAdapter and roll back on failure.                                                                                             |
| `analytics.ts`         | `analyticsEnabledAtom` (boolean) with optimistic update + rollback. Uses `ANALYTICS_ENABLED_STORAGE_KEY`.                                                                                                                                                |
| `provider.ts`          | `featureProviderConfigAtom` / `providerConfigAtom` `atomFamily` — derived from `configAtom`/`configFieldsAtomMap.providersConfig`. Also exports `updateLLMProviderConfig`/`updateProviderConfig` deep-merge + Zod-validated update helpers.              |
| `translation-state.ts` | `createTranslationStateAtomForContentScript(default)` — content-script atom that loads `getEnablePageTranslationFromContentScript` and subscribes to `notifyTranslationStateChanged` via `message.ts`.                                                   |
| `google-drive-sync.ts` | Conflict-resolution atoms: `unresolvedConfigsAtom`, `resolutionsAtom`, derived `diffConflictsResultAtom` / `resolvedConfigResultAtom` / `resolutionStatusAtom`, plus action atoms (`selectResolutionAtom`, `selectAllLocalAtom`, `selectAllRemoteAtom`). |
| `last-sync-time.ts`    | Read-only `lastSyncTimeAtom` derived from the meta of `LAST_SYNCED_CONFIG_STORAGE_KEY`; subscribes to the WXT meta key (`local:…$`).                                                                                                                     |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Use `storageAdapter`, not raw `storage` calls.** It validates with Zod on read/write and silently falls back to a default on schema drift — exactly what you want for forward-compatible config.
- **Persisted atoms must implement the three-source sync pattern.** `configAtom`/`themeModeAtom`/`detectedCodeAtom`/`analyticsEnabledAtom` all do (1) initial `get` on mount, (2) `storage.watch` for cross-context, (3) `document.visibilitychange` re-load (issue #435 — inactive tabs miss watch events). Replicate this when adding a new persisted atom.
- **Optimistic-then-persist with rollback.** Set the local atom synchronously, await the storage write, and on error restore the previous value. `writeConfigAtom` additionally uses a serial promise chain + write-version counter so concurrent writes do not "flash back" stale values.
- **Do not export the writable base atom.** Pattern: private `baseFooAtom` + public read/write `fooAtom` whose write goes through `storageAdapter`. Only expose the base for explicit pre-mount hydration (see `theme.ts` comment).
- **`onMount` cleanup is mandatory** — return a function that calls `unwatch()` and removes the `visibilitychange` listener, otherwise tabs leak listeners over their lifetime.
- **Field atoms via `configFieldsAtomMap[key]`** to avoid re-rendering subscribers of unrelated config slices; built once at module load via `selectAtom`.

### Testing Requirements

- Specs live in `atoms/__tests__/`. Use Vitest's `describe.concurrent` only when atoms truly do not share storage keys.
- WXT's fake browser provides an in-memory `storage` — do not stub it; reset between tests if a previous test wrote.

### Common Patterns

- **Atom families for keyed state** (`atomFamily` from `jotai-family`) — e.g. `providerConfigAtom(id)` returns the same atom for the same id within a session.
- **Derived atoms compose pure helpers** — `diffConflictsResultAtom` runs `detectConflicts` from `google-drive/conflict-merge.ts`; keep merging logic outside the atom file so it stays testable in isolation.
- **Schema-driven validation on every read.** A storage value that fails `safeParse` is treated as missing and the default is returned — never throw out of `get`.

## Dependencies

### Internal

- `@/types/config/*` — `Config`, provider, theme schemas.
- `@/utils/constants/config` (`CONFIG_STORAGE_KEY`, `THEME_STORAGE_KEY`, `DETECTED_CODE_STORAGE_KEY`, `LAST_SYNCED_CONFIG_STORAGE_KEY`, `DEFAULT_CONFIG`).
- `@/utils/constants/analytics`, `@/utils/constants/feature-providers` — enum + provider definitions.
- `@/utils/config/helpers` — `getProviderConfigById` for provider lookups.
- `@/utils/google-drive/conflict-merge` — `detectConflicts`/`applyResolutions` consumed by sync atoms.
- `@/utils/message` — content-script translation state IPC.
- `@/utils/utils` — `isNonNullish`.
- `@/utils/logger`.

### External

- `jotai`, `jotai/utils` (`selectAtom`), `jotai-family` (`atomFamily`).
- `deepmerge-ts` — `deepmergeCustom` with array-overwrite for config patches.
- `zod` — schemas validated on every storage read/write.
- `#imports` (WXT) — `storage`.

<!-- MANUAL: -->
