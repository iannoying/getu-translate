<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-25 -->

# definitions (@getu/definitions)

## Purpose

The `@getu/definitions` package provides shared type definitions, constants, and Zod schemas that are consumed across the GetU Translate monorepo. It is a fork of `@read-frog/definitions`, re-exporting the upstream content while overriding brand/URL/domain constants with GetU-specific values (`APP_NAME = "GetU Translate"`, `GETU_DOMAIN`, `WEBSITE_PROD_URL`, `WEBSITE_CADDY_DEV_URL`, `AUTH_DOMAINS`).

**No build step** — `package.json` points `main`/`types`/`exports` directly at raw TypeScript (`./src/index.ts`). Resolution relies on the consuming bundler (WXT/Vite + tsconfig paths).

## Key Files

| File              | Description                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`    | Package manifest. Name: `@getu/definitions`. Depends only on `zod`.                                                             |
| `tsconfig.json`   | TypeScript config targeting ES2022, `moduleResolution: bundler`, `noEmit: true`.                                                 |
| `src/index.ts`    | Barrel export. Re-exports everything from `base.js` and adds GetU-specific URL constant overrides.                               |
| `src/base.d.ts`   | Generated type declarations for all upstream definitions (language constants, column types, auth, URL constants, schemas, utils). |
| `src/base.js`     | Compiled JS bundle (pre-built from upstream fork; do not edit manually).                                                         |
| `src/translate-models.ts` | M6 — registry of the 11 web `/translate` comparison models (2 free + 9 Pro). Distinct from `@getu/contract`'s `AI_MODEL_COEFFICIENTS` whitelist. |
| `vitest.config.ts` | Vitest config (node environment) for the package's `__tests__/`.                                                              |

## Subdirectories

| Directory | Purpose                                    |
| --------- | ------------------------------------------ |
| `src/`    | All source files (see `src/AGENTS.md`).    |

## For AI Agents

### Working In This Directory

- **Always import from `@getu/definitions`**, never from the old `@read-frog/definitions` — they differ in URL constants.
- **GetU overrides** are in `src/index.ts`: `APP_NAME = "GetU Translate"`, `GETU_DOMAIN`, `WEBSITE_PROD_URL`, `WEBSITE_CADDY_DEV_URL`, `AUTH_DOMAINS`. These shadow the upstream values. Note: the extension still has its own local `APP_NAME` constant under `apps/extension/src/utils/constants/app.ts` that lags behind — that's intentional (it controls the IndexedDB name and renaming it would orphan every user's database).
- **Do not edit `src/base.js` or `src/base.d.ts`** — generated artifacts from upstream fork.
- To add new shared definitions: add them directly to `src/index.ts` as new exports.

### Testing Requirements

- Most upstream re-exports rely on TypeScript for correctness — no runtime tests.
- New constants/registries with derived data (e.g. `src/translate-models.ts`) get a focused `__tests__/*.test.ts` covering the invariants (counts, kind/free flags, lookup maps). Run with `pnpm --filter @getu/definitions test`.

### Common Patterns

- Language codes use both ISO 639-3 (`LangCodeISO6393`) and ISO 639-1 (`LangCodeISO6391`) with conversion utilities.
- All schemas use Zod v4.
- Column types: `string | number | boolean | date | select`.
- Semantic version utilities: `parseSemanticVersion`, `getVersionType`, `semanticVersionSchema`.

## Dependencies

### External

- `zod` — Schema validation.
