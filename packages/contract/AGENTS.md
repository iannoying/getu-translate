<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-21 -->

# contract (@getu/contract)

## Purpose

The `@getu/contract` package defines the oRPC API contract shared between the GetU Translate browser extension and the backend server. It declares typed route definitions (procedures) and their Zod input/output schemas for custom tables, columns, rows, and notebase beta status. The contract is consumed by the extension's oRPC client (`apps/extension/src/utils/orpc/`) and implemented by the backend server.

**No build step** — `package.json` points `main`/`types`/`exports` directly at raw TypeScript (`./src/index.ts`). Resolution relies on the consuming bundler (WXT/Vite + tsconfig paths).

## Key Files

| File              | Description                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `package.json`    | Package manifest. Name: `@getu/contract`. Depends on `@getu/definitions` and `@orpc/contract`.                               |
| `tsconfig.json`   | TypeScript config targeting ES2022, `moduleResolution: bundler`, `noEmit: true`.                                              |
| `src/index.ts`    | Barrel export re-exporting everything from `src/base.js`.                                                                     |
| `src/base.d.ts`   | Generated type declarations for the full contract (schemas + oRPC procedure builders + `ORPCRouterClient` type).              |
| `src/base.js`     | Compiled JS bundle (pre-built from the upstream fork; do not edit manually).                                                  |

## Subdirectories

| Directory | Purpose                                                            |
| --------- | ------------------------------------------------------------------ |
| `src/`    | All source files (see `src/AGENTS.md`).                            |

## For AI Agents

### Working In This Directory

- **Do not manually edit `src/base.js` or `src/base.d.ts`** — these are compiled artifacts from the upstream `@read-frog/api-contract` fork. To change the contract, update the upstream source and regenerate, or add new exports to `src/index.ts` on top.
- **No build step**: The package is consumed directly as TypeScript by WXT/Vite. If a plain Node script needs to import this, add a build step first.
- Adding new routes: Define the oRPC procedure in the upstream source or extend `src/index.ts` with additional exports.
- Keep schemas in sync with the backend implementation — this package is the single source of truth for the API shape.

### Testing Requirements

- No dedicated tests in this package. Schema correctness is validated by TypeScript.
- Integration validated via the extension's oRPC client tests.

### Common Patterns

- All schemas use Zod v4.
- Mutation endpoints return `{ txid: number }` for optimistic concurrency.
- The `contract` object is an oRPC router definition; `ORPCRouterClient` is the typed client interface.

## Dependencies

### Internal

- `@getu/definitions` (`workspace:*`) — Used for shared type imports.

### External

- `@orpc/contract` — oRPC contract builder.
- `zod` — Schema validation.
