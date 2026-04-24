<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-24 -->

# definitions/src

## Purpose

Source directory for `@getu/definitions`. Contains the barrel export (`index.ts`) and the pre-built upstream artifacts (`base.js`, `base.d.ts`), plus GetU-specific constant overrides added directly in `index.ts` (including `APP_NAME = "GetU Translate"`).

## Key Files

| File         | Description                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | Barrel re-export of all upstream symbols from `base.js`, plus GetU-specific overrides: `APP_NAME`, `GETU_DOMAIN`, `WEBSITE_PROD_URL`, `WEBSITE_CADDY_DEV_URL`, `AUTH_DOMAINS`. |
| `base.d.ts`  | Generated TypeScript declarations covering: app constants, auth, column types, language code constants/schemas/utilities, dictionary labels, URL constants, column config schemas, cell/row schema builders, version utilities. |
| `base.js`    | Compiled JS artifact (fork of `@read-frog/definitions`). Do not edit manually.                                                                                  |

## For AI Agents

### Working In This Directory

- **Only edit `index.ts`** to add or change GetU-specific overrides and re-exports.
- `base.js`/`base.d.ts` are generated — regenerate from upstream source if upstream changes are needed.
- **GetU overrides in `index.ts`** shadow the upstream values: `APP_NAME = "GetU Translate"`, `WEBSITE_PROD_URL = "https://getutranslate.com"`, `GETU_DOMAIN = "getutranslate.com"`.
- Note: `apps/extension/src/utils/constants/app.ts` keeps its own local `APP_NAME = "Read Frog"` constant — that one is intentionally frozen (it controls the IndexedDB name; renaming orphans every user's DB). Only the definitions override flows into UI strings.

### Exported API highlights

- Language: `LANG_CODE_ISO6391_OPTIONS`, `LANG_CODE_ISO6393_OPTIONS`, `langCodeISO6391Schema`, `langCodeISO6393Schema`, `LANG_CODE_TO_EN_NAME`, `ISO6393_TO_6391`, `RTL_LANG_CODES`
- Column: `COLUMN_TYPES`, `columnConfigSchema`, `COLUMN_TYPE_INFO`, `createCellSchema`, `createRowSchema`
- Version: `semanticVersionSchema`, `parseSemanticVersion`, `getVersionType`
- Auth/URL: `AUTH_BASE_PATH`, `AUTH_COOKIE_PATTERNS`, `AUTH_DOMAINS`, `WEBSITE_PROD_URL`, `GETU_DOMAIN`

## Dependencies

### Internal

- `../package.json` — Package config resolves this as `@getu/definitions`.
