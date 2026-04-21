<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# orpc

## Purpose

Single-file oRPC client that talks to the Read Frog backend's RPC router (`@read-frog/api-contract`) using the typed router type `ORPCRouterClient`. Like `auth/auth-client.ts`, all transport goes through the background `backgroundFetch` so content-script callers don't trip CORS. Also bundles a Tanstack-Query utility wrapper (`createTanstackQueryUtils`) so React components get type-safe `queryOptions` / `mutationOptions` without restating procedure paths.

## Key Files

| File        | Description                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.ts` | Builds an `RPCLink` to `${WEBSITE_URL}/api/rpc` with header `x-orpc-source: extension`. The `fetch` impl rebuilds the request (URL, method, normalized headers via `normalizeHeaders`, optional `text()` body) and calls `sendMessage("backgroundFetch", { credentials: "include" })`. Exports `orpcClient` (raw) and `orpc` (`createTanstackQueryUtils(orpcClient)`). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Use `orpc.foo.bar.queryOptions(...)` in React** rather than calling `orpcClient.foo.bar(...)` directly — it gives you correct cache keys + the `meta.suppressToast`/`meta.errorDescription` integration in `tanstack-query.ts`.
- **The fetch impl always sets `credentials: "include"`** — necessary because the backend reads `better-auth` session cookies. Don't change this without coordinating with `auth/auth-client.ts`.
- **The TODO calls out `ORPC_PREFIX`** — when `@read-frog/definitions` exports it, switch `${WEBSITE_URL}/api/rpc` to use that constant.
- **`x-orpc-source: extension`** is read by the backend for analytics + rate-limiting tier. Do not strip it.
- This file uses `req.text()` to materialize the request body before sending — works for JSON / string bodies (oRPC's defaults). If you ever stream binary uploads through oRPC, switch to base64-via-`ProxyRequest` like `background-asset-url.ts`.
- `WEBSITE_URL` flips between dev/prod via env (`WXT_USE_LOCAL_PACKAGES=true`). The client is built at module load — restart `pnpm dev` after toggling.

### Testing Requirements

- No co-located tests today. When testing, mock `sendMessage` from `@/utils/message` rather than `globalThis.fetch`.

### Common Patterns

- Mirrors `auth/auth-client.ts` — both wrap `sendMessage("backgroundFetch", …)` and return a real `Response`. Keep the `ProxyRequest` field set in sync between them.

## Dependencies

### Internal

- `@read-frog/api-contract` — `ORPCRouterClient` type.
- `@/utils/constants/url` — `WEBSITE_URL`.
- `@/utils/http` — `normalizeHeaders`.
- `@/utils/message` — `sendMessage("backgroundFetch", …)`.

### External

- `@orpc/client` — `createORPCClient`.
- `@orpc/client/fetch` — `RPCLink`.
- `@orpc/tanstack-query` — `createTanstackQueryUtils`.

<!-- MANUAL: -->
