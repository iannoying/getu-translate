<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-21 -->

# definitions (@getu/definitions)

## Purpose

The `@getu/definitions` package provides shared type definitions, constants, and Zod schemas that are consumed across the GetU Translate monorepo. It is a fork of `@read-frog/definitions`, re-exporting the upstream content while overriding URL/domain constants with GetU-specific values (`GETU_DOMAIN`, `WEBSITE_PROD_URL`, `WEBSITE_CADDY_DEV_URL`, `AUTH_DOMAINS`).

**No build step** — `package.json` points `main`/`types`/`exports` directly at raw TypeScript (`./src/index.ts`). Resolution relies on the consuming bundler (WXT/Vite + tsconfig paths).

## Key Files

| File              | Description                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`    | Package manifest. Name: `@getu/definitions`. Depends only on `zod`.                                                             |
| `tsconfig.json`   | TypeScript config targeting ES2022, `moduleResolution: bundler`, `noEmit: true`.                                                 |
| `src/index.ts`    | Barrel export. Re-exports everything from `base.js` and adds GetU-specific URL constant overrides.                               |
| `src/base.d.ts`   | Generated type declarations for all upstream definitions (language constants, column types, auth, URL constants, schemas, utils). |
| `src/base.js`     | Compiled JS bundle (pre-built from upstream fork; do not edit manually).                                                         |

## Subdirectories

| Directory | Purpose                                    |
| --------- | ------------------------------------------ |
| `src/`    | All source files (see `src/AGENTS.md`).    |

## For AI Agents

### Working In This Directory

- **Always import from `@getu/definitions`**, never from the old `@read-frog/definitions` — they differ in URL constants.
- **GetU overrides** are in `src/index.ts`: `GETU_DOMAIN`, `WEBSITE_PROD_URL`, `WEBSITE_CADDY_DEV_URL`, `AUTH_DOMAINS`. These shadow the upstream values.
- **`APP_NAME`** is still `"Read Frog"` pending Phase 1 Task 5 (brand rename PR). Do not change until that task lands.
- **Do not edit `src/base.js` or `src/base.d.ts`** — generated artifacts from upstream fork.
- To add new shared definitions: add them directly to `src/index.ts` as new exports.

### Testing Requirements

- No dedicated tests. Schema correctness is validated by TypeScript.

### Common Patterns

- Language codes use both ISO 639-3 (`LangCodeISO6393`) and ISO 639-1 (`LangCodeISO6391`) with conversion utilities.
- All schemas use Zod v4.
- Column types: `string | number | boolean | date | select`.
- Semantic version utilities: `parseSemanticVersion`, `getVersionType`, `semanticVersionSchema`.

## Dependencies

### External

- `zod` — Schema validation.
