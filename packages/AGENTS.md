<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-24 -->

# packages

## Purpose

Container directory for all shared internal packages in the GetU Translate monorepo. Packages here are consumed by apps in `apps/` via the `workspace:*` protocol. None of these packages have a build step — they ship raw TypeScript and rely on the consuming bundler (WXT/Vite/Next + tsconfig paths) for resolution.

## Subdirectories

| Directory      | Purpose                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract/`    | `@getu/contract` — oRPC API contract (routes, Zod schemas) shared between api + web/extension clients (see `contract/AGENTS.md`).           |
| `db/`          | `@getu/db` — Drizzle schema + `createDb()` factory over Cloudflare D1 (SQLite). Migrations live in `db/drizzle/` (see `db/AGENTS.md`).       |
| `definitions/` | `@getu/definitions` — Shared type/data definitions, language constants, and GetU-branded URL overrides (see `definitions/AGENTS.md`).       |

## For AI Agents

### Working In This Directory

- Do not add source files directly here — all code lives inside package subdirectories.
- To add a new shared package: create a subdirectory with `package.json` (set `"main": "./src/index.ts"` for no-build resolution), `tsconfig.json`, and an `AGENTS.md`.
- All packages use `"type": "module"` and point `main`/`types`/`exports` directly at raw TypeScript source.
- **No build step**: If you need to import a package from a plain Node script or Jest without a bundler, add a `tsup`/`tsc` build step and update exports first.

### Common Patterns

- Barrel export via `src/index.ts`.
- Zod for all schemas — keep schema and TypeScript type co-located.
- `@getu/definitions` is a dependency of `@getu/contract`; avoid circular dependencies.

## Dependencies

### Internal

- Packages may depend on each other via `workspace:*` (e.g. `contract` depends on `definitions`).

### External

- `zod` — used across all packages for schema validation.
- `@orpc/contract` — used by `contract/` for route definitions.
