<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# auth

## Purpose

Single-file integration of better-auth's React client with Read Frog's content-script CSP constraints. The exported `authClient` issues every credentialed request through the background `backgroundFetch` proxy so that auth cookies are sent to the Read Frog backend (`WEBSITE_URL + AUTH_BASE_PATH`) without tripping host-site CORS.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-client.ts` | Builds a `createAuthClient({ baseURL, fetchOptions: { customFetchImpl } })` where `customFetchImpl` rebuilds the request via `sendMessage("backgroundFetch", …)` with `credentials: "include"` and a fixed `cacheConfig.groupKey: "auth"`. Relative URLs are joined to `WEBSITE_URL`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Always go through `authClient`, never `better-auth/react` directly** in code that may run in a content script — direct `fetch()` will fail CORS for cross-origin auth endpoints.
- The `cacheConfig.groupKey: "auth"` means responses get cached in `session-cache/` under the `cache_auth_*` namespace. Use `SessionCacheGroupRegistry.removeCacheGroup("auth")` (background) when forcing a session refresh.
- The redirect URL `${WEBSITE_URL}${AUTH_BASE_PATH}` is built at module init — when `WEBSITE_URL` flips between `WEBSITE_PROD_URL` and `WEBSITE_CADDY_DEV_URL` (env `WXT_USE_LOCAL_PACKAGES=true`), restart the dev server so the module reloads.
- The custom fetch only forwards string bodies; if you ever pass `FormData`/`Blob` through better-auth, extend `createCustomFetch` to base64-encode and add a `bodyEncoding` field to `ProxyRequest`.

### Testing Requirements

- No co-located tests today. If you need to test sign-in flow, mock `sendMessage` from `@/utils/message` rather than the global `fetch`.

### Common Patterns

- Same shape as `orpc/client.ts` — both wrap `sendMessage("backgroundFetch", …)` and re-materialize a `Response`. Keep them in sync if you change the proxy contract.

## Dependencies

### Internal

- `@/utils/message` — `sendMessage("backgroundFetch", …)`.
- `@/utils/http` — `normalizeHeaders`.
- `@/utils/constants/url` — `WEBSITE_URL`.
- `@/types/proxy-fetch` — `CacheConfig`.

### External

- `better-auth/react` — `createAuthClient` factory.
- `@read-frog/definitions` — `AUTH_BASE_PATH`.

<!-- MANUAL: -->
