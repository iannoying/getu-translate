<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-24 -->

# apps

## Purpose

Container directory for all deployable applications in the GetU Translate monorepo. Each subdirectory is a standalone pnpm workspace package with its own `package.json`, build pipeline, and test suite. Three apps ship today: the MV3 browser extension, the Cloudflare Workers API, and the Next.js marketing/account website.

## Subdirectories

| Directory     | Purpose                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `extension/`  | `@getu/extension` — WXT browser extension for Chrome / Edge / Firefox MV3 (see `extension/AGENTS.md`).                        |
| `api/`        | `@getu/api` — Cloudflare Worker: Hono + better-auth + oRPC, Paddle/Stripe webhooks, AI proxy, D1 (see `api/AGENTS.md`).       |
| `web/`        | `@getu/web` — Next.js 15 static export deployed to Cloudflare Pages at `getutranslate.com` (see `web/AGENTS.md`).             |

## For AI Agents

### Working In This Directory

- Do not add source files directly here — all code lives inside app subdirectories.
- To add a new app, create a subdirectory with its own `package.json` (the workspace is already configured to pick up `apps/*`).
- Each app manages its own dependencies, scripts, and AGENTS.md.

### Testing Requirements

- Run tests for all apps via `pnpm test` at the monorepo root, or `pnpm --filter <package-name> test` for a specific app.

## Dependencies

### Internal

- Apps may depend on packages from `packages/` via `workspace:*` protocol.
