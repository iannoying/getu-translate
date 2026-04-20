<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# recovery

## Purpose

Top-level error boundary + fallback that protects the options page (and any other React surface) from a corrupt config crashing the whole UI. Wraps children in `react-error-boundary`'s `ErrorBoundary`, normalizes the caught error to an `Error` instance, and renders a recovery card that lets the user (a) export current config (with or without API keys) for backup, (b) reload the page, or (c) reset the entire config to `DEFAULT_CONFIG` after an `AlertDialog` confirmation.

## Key Files

| File                    | Description                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recovery-boundary.tsx` | `RecoveryBoundary` - thin `ErrorBoundary` wrapper that renders `<RecoveryFallback />` and forwards `resetErrorBoundary` as `onRecovered`.                                                                                 |
| `recovery-fallback.tsx` | `RecoveryFallback` - displays the error message in a destructive `Alert`, exposes export-with/without-API-keys via `useExportConfig`, and resets config via `writeConfigAtom` + `DEFAULT_CONFIG`. Toasts success/failure. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- This boundary owns "config corrupted" recovery, not generic UI errors. If you add finer-grained boundaries (e.g. per-card), keep them inside their own feature folder so this remains the last line of defense.
- The fallback writes via `writeConfigAtom` (not `configAtom`) - that's the side-effecting setter that persists to WXT storage. Don't switch to `setConfig(configAtom, ...)` or you'll bypass persistence.
- Export mutations come from `useExportConfig`; pass `schemaVersion: CONFIG_SCHEMA_VERSION` so older versions can be migrated when re-imported.
- Reset goes through an `AlertDialog` for a reason - never call `setConfig(DEFAULT_CONFIG)` directly without confirmation; users can lose all their providers/keys/prompts.
- Strings live under `errorRecovery.*` in the i18n catalog; reuse those keys when extending the UI.

### Testing Requirements

- Vitest + `@testing-library/react`. Render `<RecoveryBoundary>` with a child that throws on first render, assert the fallback shows the error message, then trigger the reset action and assert `writeConfigAtom` was called with `DEFAULT_CONFIG` (mock the Jotai setter). Cover both export buttons.

### Common Patterns

- `error instanceof Error ? error : new Error(String(error))` to normalize because `ErrorBoundary` may surface non-Error throws.
- Disabled buttons during `isExporting || isResetting` to prevent double submissions.
- `window.location.reload()` as the lightest-touch recovery action before the destructive reset.

## Dependencies

### Internal

- `@/components/ui/base-ui/alert`, `alert-dialog`, `button`.
- `@/hooks/use-export-config` - mutation that builds a downloadable JSON blob.
- `@/utils/atoms/config` - `configAtom`, `writeConfigAtom`.
- `@/utils/constants/config` - `DEFAULT_CONFIG`, `CONFIG_SCHEMA_VERSION`.

### External

- `react-error-boundary` - `ErrorBoundary` with `fallbackRender`.
- `jotai` - `useAtomValue`, `useSetAtom`.
- `sonner` - reset success/error toasts.
- `@tabler/icons-react` - `IconAlertCircle`.

<!-- MANUAL: -->
