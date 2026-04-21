<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# backup

## Purpose

Local rolling-backup history for the user's `Config`. Backups are stored as individual WXT-storage items keyed `local:configBackup_<timestamp>_<uuid>`, with an index list at `local:backup_ids` and per-item metadata (`createdAt`, `extensionVersion`). The newest 8 are kept; older ones are evicted automatically. The options-page settings UI uses these to let users diff against / restore previous configs and powers the "auto-snapshot before risky edit" flow.

## Key Files

| File         | Description                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage.ts` | All CRUD: `getAllBackupsWithMetadata` (sorted newest-first), `isSameAsLatestBackup` (dequal + schemaVersion check to skip duplicates), `addBackup` (FIFO eviction past `MAX_BACKUPS_COUNT`), `removeBackup`, `clearAllBackups`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Eviction uses bulk `storage.removeItems` with `removeMeta: true`** — keep both the data item and its meta side-by-side, otherwise the meta entries leak.
- **Always check `isSameAsLatestBackup` before `addBackup`** if you're auto-snapshotting on a timer, otherwise you'll burn through the 8-slot history with identical entries.
- Backups embed `CONFIG_SCHEMA_VERSION` from `@/utils/constants/config`; on restore the caller must run `migrateConfig` (`@/utils/config/migration`) before applying.
- `BACKUP_ID_PREFIX` and `MAX_BACKUPS_COUNT` live in `@/utils/constants/backup` — change them there, not here.
- The index list `local:backup_ids` is the source of truth for ordering. If a write fails mid-flight you can have an item with no entry in the list (orphan); a follow-up `getAllBackupsWithMetadata` simply skips it.

### Testing Requirements

- No co-located tests today. When adding tests, reset WXT fake storage between cases since `local:backup_ids` accumulates.

### Common Patterns

- Same "list-of-keys index + per-item storage" pattern used in `session-cache/session-cache-group.ts`.

## Dependencies

### Internal

- `@/types/backup` — `ConfigBackup`, `ConfigBackupMetadata`, `ConfigBackupWithMetadata`.
- `@/types/config/config` — `Config`.
- `@/utils/constants/backup` — `BACKUP_ID_PREFIX`, `MAX_BACKUPS_COUNT`.
- `@/utils/constants/config` — `CONFIG_SCHEMA_VERSION`.
- `@/utils/crypto-polyfill` — `getRandomUUID`.
- `@/utils/logger`.

### External

- `dequal` — deep equality for the duplicate-skip check.
- `#imports` (WXT) — `storage`.

<!-- MANUAL: -->
