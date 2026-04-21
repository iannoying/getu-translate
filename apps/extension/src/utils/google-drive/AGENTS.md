<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# google-drive

## Purpose

Read Frog's optional config-sync engine, backed by Google Drive's `appDataFolder` (per-app private space, invisible in the user's Drive UI). OAuth runs through `chrome.identity.launchWebAuthFlow`, the access token + expiry are persisted in WXT storage, and the sync engine performs a 3-way merge between (a) the local config, (b) the last successfully-synced snapshot, and (c) the remote `read-frog-config.json`. Conflicts surface as a structured field-by-field diff that the options UI lets the user resolve interactively.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.ts`           | OAuth 2.0 implicit flow (token in URL fragment), Zod-validated token schema persisted at `local:__googleDriveToken`. `authenticateGoogleDriveAndSaveTokenToStorage`, `getValidAccessToken` (re-auths inside the 60s expiry buffer), `clearAccessToken`, `getIsAuthenticated`, `getGoogleUserInfo` (used to bind the sync to a specific email). Scopes: `drive.appdata` + `userinfo.email`.                                                                                        |
| `api.ts`            | Google Drive REST helpers scoped to `appDataFolder`: `findFileInAppData(name)`, `downloadFile(id)`, `uploadFile(name, content, fileId?)` (multipart create or PATCH), `deleteFile(id)`. All call `getValidAccessToken` and on 401 call `clearAccessToken` before throwing. Validates responses with Zod.                                                                                                                                                                          |
| `storage.ts`        | `getRemoteConfigAndMetaWithUserEmail` — fetch + parse + run `migrateConfig` against `CONFIG_SCHEMA_VERSION` (re-throws `ConfigVersionTooNewError`, recovers from other migration errors as "no remote"). `setRemoteConfigAndMeta` — find-then-PATCH-or-POST.                                                                                                                                                                                                                      |
| `sync.ts`           | `syncConfig()` returning `SyncResult` (`uploaded` / `downloaded` / `same-changes` / `no-change` / `unresolved` / `error`). 3-way logic: if email differs from last-sync, prefer remote (or upload if none); else compare `lastModifiedAt` of local + remote against the lastSynced snapshot, deep-equal to short-circuit, otherwise yield `unresolved` with `{ base, local, remote }`. `syncMergedConfig` — apply the user's resolution (validates against `configSchema` first). |
| `conflict-merge.ts` | `detectConflicts(base, local, remote)` — recursive walk that treats primitives/arrays/null as atomic, returns `{ draft, conflicts: FieldConflict[] }`. Auto-applies same-changes; tracks any side-only changes as conflicts that the user must explicitly confirm. `applyResolutions(diff, resolutions)` — clones `draft`, applies user-picked `local`/`remote` per `path.join('.')`, validates result with `configSchema`.                                                       |
| `constants.ts`      | `GOOGLE_DRIVE_CONFIG_FILENAME = "read-frog-config.json"`.                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **The OAuth client ID is `import.meta.env.WXT_GOOGLE_CLIENT_ID`** — set it in `.env.local` for dev. The redirect URI comes from `browser.identity.getRedirectURL()` and must be allow-listed in the GCP OAuth client.
- **Always go through `getValidAccessToken`** (not the storage adapter) — it handles the 60s pre-expiry refresh and re-auth via `launchWebAuthFlow`. Never read the token directly.
- **On 401 the API helpers `clearAccessToken` then throw.** Callers should catch and either trigger a re-auth flow or surface a "please reconnect" message. Don't swallow.
- **Conflict detection treats arrays as atomic** (`isAtomicValue` returns true for `Array.isArray`). This is intentional — diffing arbitrary array element identity is unreliable for config — but means a single pattern reorder shows up as a full-array conflict.
- **`applyResolutions` returns `{ config, validationError }` separately** so the UI can show schema-failure feedback alongside the resolution UI without losing the user's picks. Always check both.
- **Email-binding sync.** `lastSyncedConfig.meta.email` ties a sync to a Google identity. Switching accounts forces a "remote-wins" download (or upload-if-empty) — preserving this is what stops two accounts from cross-pollinating.
- The `appDataFolder` cleanup is intentionally absent from this directory — to delete data, the user must revoke the app via Google Account settings; surfaced in the options UI as a deep link.

### Testing Requirements

- Tests live in `google-drive/__tests__/`. Use Vitest mocks for `fetch` (these helpers do not use `backgroundFetch` — the auth flow + Drive API calls are made directly because they need `chrome.identity` and the SW is the right context for that anyway).

### Common Patterns

- **3-way merge with field-level conflict.** The `detectConflicts` recursion is reusable for any other "remote vs local with last-sync baseline" sync target.
- **Zod-validated wire types.** Every Google API response is parsed before use — failures throw with a stable error message.

## Dependencies

### Internal

- `@/types/config/config`, `@/types/config/meta` — schemas and meta types.
- `@/utils/config/storage`, `@/utils/config/sync` — local + last-sync storage adapters.
- `@/utils/config/migration`, `@/utils/config/errors` — migration runner and `ConfigVersionTooNewError`.
- `@/utils/constants/config` — `CONFIG_SCHEMA_VERSION`, `GOOGLE_DRIVE_TOKEN_STORAGE_KEY`.
- `@/utils/atoms/google-drive-sync` — referenced as a type producer for `UnresolvedConfigs`.
- `@/utils/logger`.

### External

- `#imports` (WXT) — `browser.identity.launchWebAuthFlow`, `storage`.
- `zod` — schema validation for token + Drive responses.
- `dequal` — deep equality used by both 3-way detection and same-config short-circuit in `syncConfig`.

<!-- MANUAL: -->
