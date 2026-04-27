---
name: Cloudflare all-in deploy lessons (Phase 2)
description: Gotchas from Phase 2 production deploy (D1 + Workers + Pages). Apply to any future CF deployment work on this repo.
type: project
originSessionId: 0d3407cb-27ce-4f16-bf92-5de73a668d49
---
Phase 2 went live on Cloudflare D1 + Workers + Pages 2026-04-21. Key gotchas:

**1. Proxy env breaks wrangler.** User's shell has `HTTP_PROXY`/`HTTPS_PROXY` set that intermittently block Cloudflare API endpoints, producing `fetch failed` or timeouts. Always prefix wrangler commands with `HTTP_PROXY="" HTTPS_PROXY="" NO_PROXY="*.cloudflare.com,*.pages.dev,*.workers.dev"` when deploying or executing D1 remote operations.

**2. `wrangler deploy` uses top-level config by default.** To get production `[env.production]` overrides, set `"deploy": "wrangler deploy --env production"` in the package.json script, and keep top-level `[vars]` as dev values so `wrangler dev` stays offline.

**3. D1 creation is one-shot; the ID is the source of truth.** Running `wrangler d1 create getu-translate` returned `database_id: 903fa2ef-2aaa-4f20-b3a7-a2ef59a8cb70`. Persisted in `apps/api/wrangler.toml` under both `[[d1_databases]]` (dev) and `[[env.production.d1_databases]]` (prod). Same binding name `DB` both places.

**4. `NEXT_PUBLIC_*` is baked at build time, not runtime.** For `apps/web` static export, the CF Pages dashboard env var for `NEXT_PUBLIC_API_BASE_URL` is a NOP on already-deployed bundles. Must rebuild with `NEXT_PUBLIC_API_BASE_URL=https://api.getutranslate.com pnpm --filter @getu/web build` then redeploy the `out/` dir.

**5. `@cloudflare/next-on-pages` is deprecated.** Trust-policy also rejects it (undici downgrade). We use Next.js `output: "export"` instead (apps/web is fully client-side; no SSR needed for Phase 2). Switch to `@opennextjs/cloudflare` ONLY if Phase 3+ needs SSR/edge runtime.

**6. better-auth client needs `basePath` explicit.** Server `basePath: "/api/identity"` + default client path `/api/auth` = 404 with no CORS headers = browser "Failed to fetch". Web's `createAuthClient({ baseURL: "<API>/api/identity" })` — append the path to baseURL. Extension's auth-client does it via `WEBSITE_URL + AUTH_BASE_PATH` already.

**7. Custom domain binding is dashboard-only.** `wrangler` has no CLI for binding `api.getutranslate.com` to the Worker or `getutranslate.com` to Pages. Worker & Pages → project → Custom Domains → Add. Requires ~1-5 min for SSL cert provisioning.

**8. Secrets: `wrangler secret put` auto-creates a Worker if missing.** If you `wrangler secret put AUTH_SECRET --env production` before deploying code, it creates an empty placeholder worker of that name. Deploying real code overwrites. Order-independent but surprising.

**9. CORS errors can mask 404s.** If the route doesn't exist on the server, the response is 404 with no CORS headers, and the browser surfaces it as "No Access-Control-Allow-Origin" error. Check server routes FIRST when debugging CORS failures.

**10. First cold-start after deploy can 503.** D1 + Worker init + better-auth schema first query can time out on the first request. Retry once; if it still 503s, investigate.

**11. Pages deploy token needs Pages permission.** `wrangler pages deploy` reads `/accounts/<id>/pages/projects/getu-web` before uploading. A token that can deploy Workers/D1 can still fail Web deploy with `Authentication error [code: 10000]` if it lacks `Account → Cloudflare Pages → Edit` on the account. Prefer a dedicated GitHub secret `CLOUDFLARE_PAGES_API_TOKEN`; `Deploy Web` falls back to `CLOUDFLARE_API_TOKEN` only for compatibility.

**How to apply:**
- Any new API route on apps/api: verify CORS preflight separately from 200 responses.
- Any new frontend consumer of auth: mirror the extension's auth-client pattern (explicit baseURL including AUTH_BASE_PATH).
- Any CF account-touching command: prefix with `HTTP_PROXY=""` env cleanup.
- Any `NEXT_PUBLIC_*` change: rebuild + redeploy, don't rely on dashboard env.
- Any CF Pages automation: validate the GitHub token has `Account → Cloudflare Pages → Edit` before debugging the build.
