<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-21 -->

# auth

## Purpose

Single-file integration of better-auth's React client with Read Frog's content-script CSP constraints. The exported `authClient` issues every credentialed request through the background `backgroundFetch` proxy so that auth cookies are sent to the GetU backend (`API_URL + AUTH_BASE_PATH`, i.e. `https://api.getutranslate.com/api/identity` in prod) without tripping host-site CORS.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-client.ts` | Builds a `createAuthClient({ baseURL, fetchOptions: { customFetchImpl } })` where `customFetchImpl` rebuilds the request via `sendMessage("backgroundFetch", …)` with `credentials: "include"` and a fixed `cacheConfig.groupKey: "auth"`. Relative URLs are joined to `WEBSITE_URL`. |

## Subdirectories

- `__tests__/` — smoke tests for `authClient` API surface and constant consistency.

## For AI Agents

### Working In This Directory

- **Always go through `authClient`, never `better-auth/react` directly** in code that may run in a content script — direct `fetch()` will fail CORS for cross-origin auth endpoints.
- The `cacheConfig.groupKey: "auth"` means responses get cached in `session-cache/` under the `cache_auth_*` namespace. Use `SessionCacheGroupRegistry.removeCacheGroup("auth")` (background) when forcing a session refresh.
- The baseURL `${API_URL}${AUTH_BASE_PATH}` is built at module init — when the underlying `WEBSITE_URL` flips between `WEBSITE_PROD_URL` and `WEBSITE_CADDY_DEV_URL` (env `WXT_USE_LOCAL_PACKAGES=true`), restart the dev server so the module reloads. In prod `API_URL` prepends `api.` (separate CF Worker); in dev it falls back to `WEBSITE_URL` because Caddy serves API and web on a unified localhost port.
- The custom fetch only forwards string bodies; if you ever pass `FormData`/`Blob` through better-auth, extend `createCustomFetch` to base64-encode and add a `bodyEncoding` field to `ProxyRequest`.

### Phase 2 Dev Override

`WEBSITE_URL` (from `@/utils/constants/url`) resolves to:

| Mode                                | Value                                             |
| ----------------------------------- | ------------------------------------------------- |
| Production                          | `https://getutranslate.com` (`WEBSITE_PROD_URL`)  |
| Dev (`WXT_USE_LOCAL_PACKAGES=true`) | `http://localhost:8788` (`WEBSITE_CADDY_DEV_URL`) |

The switch happens at build time in `apps/extension/src/utils/constants/url.ts` — there is no runtime toggle.

**Local dev workflow (auth against localhost)**

Option A — unified Caddy origin (recommended):

1. Start `apps/api` on `:8788` (`pnpm --filter @getu/api dev`).
2. Start `apps/web` on `:3000` (`pnpm --filter @getu/web dev`).
3. Start the extension with local packages: `pnpm --filter @getu/extension dev:local` (`WXT_USE_LOCAL_PACKAGES=true wxt`).
4. `WEBSITE_URL` becomes `http://localhost:8788`; `authClient.baseURL` = `http://localhost:8788/api/identity`.
5. The background proxy sends cookies to `localhost` — no CORS issues.

Option B — temporary source edit (when you cannot run all services):

1. In `packages/definitions/src/index.ts`, temporarily override `WEBSITE_PROD_URL`:
   ```ts
   export const WEBSITE_PROD_URL = "http://localhost:3000" // DEV ONLY — revert before commit
   ```
2. Rebuild the extension (`pnpm --filter @getu/extension dev`).
3. Revert before committing.

**Chrome extension CORS requirements**

The extension origin (e.g. `chrome-extension://<id>`) must be listed in `ALLOWED_EXTENSION_ORIGINS` in `apps/api`. Check `apps/api/src/auth.ts` (`trustedOrigins`) and the `CHROME_EXTENSION_ORIGIN` / `EDGE_EXTENSION_ORIGIN` constants in `@getu/definitions` if preflight requests fail.

**Production flow**

`WEBSITE_URL` = `https://getutranslate.com`; every auth request goes through the `backgroundFetch` proxy (background service worker → `fetch` with `credentials: "include"`) so content-script CSP is never violated.

### Testing Requirements

- Smoke test lives in `__tests__/auth-client.test.ts` — import-time type check that `authClient` exports `signIn`, `signOut`, and `getSession`, plus constant consistency assertions for `WEBSITE_PROD_URL` and `AUTH_BASE_PATH`.
- For deeper sign-in flow tests, mock `sendMessage` from `@/utils/message` rather than the global `fetch`.

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
- `@getu/definitions` — `AUTH_BASE_PATH`.

<!-- MANUAL: -->
