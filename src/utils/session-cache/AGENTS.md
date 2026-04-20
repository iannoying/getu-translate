<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# session-cache

## Purpose

Session-scoped HTTP response cache backed by WXT's `session:` storage area (cleared when the browser session ends), grouped by a caller-supplied `groupKey` so feature subsystems (`auth`, `blog-fetch`, `orpc`, etc.) can clear their own cache without touching unrelated entries. Used by the background `backgroundFetch` handler to memoize idempotent GETs.

## Key Files

| File                              | Description                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-cache-group.ts`          | `SessionCache` — keys are `session:cache_<group>_<METHOD>_<url>`; per-item TTL via stored metadata `{ timestamp }` (default `DEFAULT_PROXY_CACHE_TTL_MS`, 24h). Maintains a per-group keys-list at `session:cache_<group>__meta_keys` so `clear()` can remove every entry in one `storage.removeItems` call. `get/set/delete/clear` all log + tolerate failures (return `undefined`). |
| `session-cache-group-registry.ts` | Static `SessionCacheGroupRegistry` — registers each `groupKey` it sees in `session:__system_cache_registry`, hands out `SessionCache` instances via `getCacheGroup(groupKey)`, and exposes `clearAllCacheGroup` / `removeCacheGroup` for global resets (e.g. on logout).                                                                                                              |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Always go through the registry.** `SessionCacheGroupRegistry.getCacheGroup(groupKey)` ensures the group is registered before returning the cache; constructing `new SessionCache(group)` directly skips registration and your group will be missed by `clearAllCacheGroup`.
- The TTL check happens on `get`: stale entries are deleted lazily, no background sweeper runs. If you need eviction without read pressure (e.g. logout), call `clear()` explicitly.
- All errors are swallowed and logged — by design, since "cache miss" is a recoverable outcome. Do not promote them to throws or callers will treat cache failures as data failures.
- The keys-list pattern is the only way to clear a group — `storage.snapshot('session')` would scan everything. Keep `set()` and `delete()` in sync with the list, and reset `isInitialized = false` after `clear()` so the next `set()` re-creates the empty list.
- TODO comments call out an unsolved race condition in the registry: simultaneous `getCacheGroup` calls for an unregistered group can both write the registry key. Acceptable today because writes are idempotent ("includes" check) but worth knowing if you change the persisted shape.

### Testing Requirements

- No co-located tests today. When adding tests, use a fresh fake-browser session per test and assert both that data is set and that `keysList` reflects it.

### Common Patterns

- "Index list + per-item entries" — same pattern as `backup/storage.ts`. Keep eviction safe by always treating the list as authoritative.

## Dependencies

### Internal

- `@/types/proxy-fetch` — `ProxyResponse`.
- `@/utils/constants/proxy-fetch` — `DEFAULT_PROXY_CACHE_TTL_MS`.
- `@/utils/logger`.

### External

- `#imports` (WXT) — `storage` (the `session:` area).

<!-- MANUAL: -->
