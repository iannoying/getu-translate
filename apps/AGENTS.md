<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-21 -->

# apps

## Purpose

Container directory for all deployable applications in the GetU Translate monorepo. Each subdirectory is a standalone pnpm workspace package with its own `package.json`, build pipeline, and test suite.

## Subdirectories

| Directory     | Purpose                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `extension/`  | The `@getu/extension` WXT browser extension (see `extension/AGENTS.md`).        |

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
