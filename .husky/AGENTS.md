<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# .husky

## Purpose

Local Git hooks managed by [Husky](https://typicode.github.io/husky/). Installed by the `prepare` script in `package.json`. Provide commit/push-time guard rails to keep CI green.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commit-msg` | Runs `pnpm exec commitlint --edit $1` to enforce the Conventional Commits format (config in `commitlint.config.cjs`).                                                                                                                                                                                                                                                                                                          |
| `pre-commit` | Runs `pnpm exec lint-staged` (config in `.lintstagedrc.json`).                                                                                                                                                                                                                                                                                                                                                                 |
| `pre-push`   | Multi-step gate: (1) blocks pushes containing **uncommented `eruda` imports** anywhere under `src/` — eruda is a dev-only console; (2) blocks pushes if `pnpm-lock.yaml` contains `overrides:` (added by `dev:local` and removable via `pnpm unlink:local`); (3) runs `pnpm exec nx lint`, then `pnpm exec nx type-check`, then `pnpm exec nx test`. If `SKIP_FREE_API=true`, the test command excludes `**/free-api.test.ts`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Do not weaken these hooks.** Adding `--no-verify` to a commit/push bypasses them — never instruct a user to do that.
- Hooks should remain idempotent and fast (the pre-push hook is the slowest gate; that's intentional — it stops broken pushes from reaching CI).
- If you need to bypass the eruda check temporarily for local debugging, comment out the import (do NOT delete the check).
- The lockfile-overrides check exists to prevent accidentally pushing the local-package alias state — fix the lockfile rather than the hook.

### Testing Requirements

- Make a trial commit with a non-conventional message to verify `commit-msg` rejects it.
- Stage a file with a lint error and commit to verify `pre-commit` blocks it.

## Dependencies

### External

- `husky`, `lint-staged`, `@commitlint/cli` (devDependencies in root `package.json`).

<!-- MANUAL: -->
