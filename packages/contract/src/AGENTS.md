<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-21 -->

# contract/src

## Purpose

Source directory for `@getu/contract`. Contains the barrel export (`index.ts`) and the pre-built artifacts (`base.js`, `base.d.ts`) that define the full oRPC API contract.

## Key Files

| File         | Description                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | Barrel re-export. Re-exports all schemas, types, and the `contract` object from `base.js`. Includes a note that no build step is needed.     |
| `base.d.ts`  | Generated TypeScript declarations for the full contract: all Zod schemas (Column, CustomTable, Row, NotebaseBeta), the `contract` oRPC router, and `ORPCRouterClient` type. |
| `base.js`    | Compiled JS artifact (fork of `@read-frog/api-contract`). Do not edit manually.                                                             |

## For AI Agents

### Working In This Directory

- **Only edit `index.ts`** for re-export changes. `base.js` and `base.d.ts` are generated artifacts.
- To add new contract procedures: update the upstream source, regenerate `base.js`/`base.d.ts`, then update `index.ts` exports.
- The contract covers: `customTable` (list/get/getSchema/create/update/delete), `column` (add/update/delete), `row` (add/update/delete), `notebaseBeta` (status).

### Common Patterns

- All mutation outputs return `{ txid: number }`.
- Column configs use a discriminated union on `type`: `string | number | boolean | date | select`.
- `ORPCRouterClient` is used in `apps/extension/src/utils/orpc/` to type the client.

## Dependencies

### Internal

- `../package.json` — Package config resolves this as `@getu/contract`.
