<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# db

## Purpose

Namespace root for the extension's IndexedDB layer. Currently houses a single Dexie database (`dexie/`) that stores translation, batch-request, article-summary, and AI-segmentation caches. Future engines (e.g. a separate metrics store) would be added as sibling subdirectories.

## Key Files

This directory has no top-level files — only subdirectories.

## Subdirectories

| Directory | Purpose                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `dexie/`  | Dexie database singleton, schema versioning, table classes, and faker-driven mock data (see `dexie/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Do not add ad-hoc IndexedDB helpers here — group them under a subdirectory keyed by storage engine (`dexie/`, future `idb/`, etc.) so import paths stay stable.
- Anything cross-engine (e.g. a generic eviction policy interface) belongs in `@/types/db` or a new sibling module, not here.
- Cleanup jobs and TTL policies live with their consumer, currently `entrypoints/background/db-cleanup.ts`, not in this directory.

### Testing Requirements

- Vitest. Dexie code under `dexie/` is exercised through `fake-indexeddb`-backed tests in caller modules; no live network or `SKIP_FREE_API` flag involved.

### Common Patterns

- Singleton DB instance exported from `dexie/db.ts`; all callers import the same `db` reference.
- Schema versions are append-only inside `AppDB`'s constructor; never mutate a published `this.version(N).stores(...)` call.

## Dependencies

### Internal

- Re-exports from `dexie/`.

### External

- None directly at this level.

<!-- MANUAL: -->
