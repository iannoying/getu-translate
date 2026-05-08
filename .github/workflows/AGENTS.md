<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-05-08 -->

# workflows

## Purpose

GitHub Actions workflows that automate testing, PR hygiene, contributor-trust gating, release management, Web Store submission, AI-driven documentation refresh, and the production Worker / Pages deploys (with M7-A3 auto-rollback on the API side).

All deploy / build workflows pin to **Node 24** and **pnpm 10.32.1** to match `package.json`. Native modules (`better-sqlite3`) are rebuilt from source against the active Node ABI on the API path — see `deploy-api.yml`.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pr-test.yml`                 | Runs lint, type-check, and Vitest on every PR. The blocking quality gate.                                                                                                                                                                                                                                                                                                                                                |
| `lint-pr.yml`                 | Validates PR titles against Conventional Commits (matches `commitlint.config.cjs`).                                                                                                                                                                                                                                                                                                                                      |
| `pr-contributor-trust.yml`    | Gates first-time contributors based on the rules in `../scripts/contributor-trust/`.                                                                                                                                                                                                                                                                                                                                     |
| `release.yml`                 | Changesets release workflow — opens / merges version PRs and tags releases.                                                                                                                                                                                                                                                                                                                                              |
| `submit.yml`                  | Builds and submits zips to Chrome Web Store, Edge Add-ons, and Firefox Add-ons.                                                                                                                                                                                                                                                                                                                                          |
| `changeset-major-warning.yml` | Warns reviewers when a PR includes a major-version changeset.                                                                                                                                                                                                                                                                                                                                                            |
| `refresh-agents-md.yml`       | Scheduled workflow that refreshes the AGENTS.md tree via Claude `/deepinit` when the codebase drifts.                                                                                                                                                                                                                                                                                                                    |
| `claude.yml`                  | Claude / Anthropic-driven helper workflow (e.g. PR review automation).                                                                                                                                                                                                                                                                                                                                                   |
| `deploy-api.yml`              | Deploys `@getu/api` to Cloudflare Workers with **auto-rollback** (M7-A3). Pipeline: install → rebuild `better-sqlite3` from source against Node 24 ABI → test → type-check → `wrangler d1 migrations apply --env production` → capture previous Worker `version_id` (newest entry from `wrangler versions list --json`) → `wrangler deploy --env production` → run `pnpm smoke:prod`. If smoke fails and a previous version was captured, runs `wrangler rollback --version-id <prev>` and fails the job. The `force_smoke_fail` `workflow_dispatch` input drills the rollback path. Concurrency is serialized via the `deploy-api-${{ github.ref }}` group so capture+deploy stays atomic. |
| `deploy-web.yml`              | Deploys `apps/web` to Cloudflare Pages. Pipeline: install → test (`@getu/web`) → type-check → `next build` (with `NEXT_PUBLIC_API_BASE_URL=https://api.getutranslate.com`) → `wrangler pages deploy out --project-name=getu-web --branch=main` → curl-based smoke against `https://getutranslate.com/`. Pages has **no CLI auto-rollback** — on smoke failure the workflow prints manual rollback instructions (Cloudflare Dash → Pages → "Rollback to this deployment") and `apps/api/DEPLOY-CHECKLIST.md § M7-A3`, then exits 1. |
| `stale-issue-pr.yml`          | Auto-closes stale issues / PRs after a quiet period.                                                                                                                                                                                                                                                                                                                                                                     |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Never weaken the quality gates.** `pr-test.yml` must continue to run lint + type-check + tests before any PR can merge.
- **Submission workflow** (`submit.yml`) requires per-store credentials in GitHub secrets (e.g. `CHROME_REFRESH_TOKEN`, `EDGE_*`, `FIREFOX_*`). Do not log them.
- **Changesets** drive versioning (`release.yml`); do not hand-edit `CHANGELOG.md` or bump versions in `package.json` manually.
- Pin third-party actions to a major tag at minimum; pin to a SHA for any action that handles secrets.
- Use the same Node version (`24`) and pnpm version (`10.32.1`) as `package.json`. Workflows that touch `better-sqlite3` MUST `setup-node` BEFORE `pnpm/action-setup` so pnpm's prebuild matches the active ABI; the API deploy then explicitly rebuilds from source via `node-gyp` to be safe.
- **Auto-rollback (deploy-api.yml)**: the rollback job depends on (a) the `previous` output from the capture step being non-empty and (b) `concurrency.cancel-in-progress: false` so a queued deploy doesn't replace the captured version mid-flight. When changing the deploy step, preserve both invariants — otherwise rollback may target the wrong version or skip silently.
- **No Pages rollback CLI**: don't add a `wrangler pages rollback` step to `deploy-web.yml` — it doesn't exist. The smoke-failure branch already prints the manual recovery procedure.

### Testing Requirements

- Workflow changes need to be exercised on a fork or branch before merging — there is no local-only validation.
- For `submit.yml`, do dry runs without uploading first.
- For `deploy-api.yml`, exercise the rollback path with the `force_smoke_fail` `workflow_dispatch` input on a staging environment before merging changes that touch the rollback / capture-version steps.

### Common Patterns

- Cache pnpm store via `actions/cache` keyed on `pnpm-lock.yaml`.
- Run `pnpm install --frozen-lockfile` to keep CI deterministic.

## Dependencies

### External

- GitHub Actions: `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `changesets/action`, store-submission actions.

<!-- MANUAL: -->
