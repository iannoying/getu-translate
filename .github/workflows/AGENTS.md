<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# workflows

## Purpose

GitHub Actions workflows that automate testing, PR hygiene, contributor-trust gating, release management, and Web Store submission for the extension.

## Key Files

| File                          | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `pr-test.yml`                 | Runs lint, type-check, and Vitest on every PR. The blocking quality gate.            |
| `lint-pr.yml`                 | Validates PR titles against Conventional Commits (matches `commitlint.config.cjs`).  |
| `pr-contributor-trust.yml`    | Gates first-time contributors based on the rules in `../scripts/contributor-trust/`. |
| `release.yml`                 | Changesets release workflow — opens / merges version PRs and tags releases.          |
| `submit.yml`                  | Builds and submits zips to Chrome Web Store, Edge Add-ons, and Firefox Add-ons.      |
| `changeset-major-warning.yml` | Warns reviewers when a PR includes a major-version changeset.                        |
| `claude.yml`                  | Claude / Anthropic-driven helper workflow (e.g. PR review automation).               |
| `stale-issue-pr.yml`          | Auto-closes stale issues / PRs after a quiet period.                                 |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Never weaken the quality gates.** `pr-test.yml` must continue to run lint + type-check + tests before any PR can merge.
- **Submission workflow** (`submit.yml`) requires per-store credentials in GitHub secrets (e.g. `CHROME_REFRESH_TOKEN`, `EDGE_*`, `FIREFOX_*`). Do not log them.
- **Changesets** drive versioning (`release.yml`); do not hand-edit `CHANGELOG.md` or bump versions in `package.json` manually.
- Pin third-party actions to a major tag at minimum; pin to a SHA for any action that handles secrets.
- Use the same Node version (`>=22`) and pnpm version (`10.32.1`) as `package.json`.

### Testing Requirements

- Workflow changes need to be exercised on a fork or branch before merging — there is no local-only validation.
- For `submit.yml`, do dry runs without uploading first.

### Common Patterns

- Cache pnpm store via `actions/cache` keyed on `pnpm-lock.yaml`.
- Run `pnpm install --frozen-lockfile` to keep CI deterministic.

## Dependencies

### External

- GitHub Actions: `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `changesets/action`, store-submission actions.

<!-- MANUAL: -->
