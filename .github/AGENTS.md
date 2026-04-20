<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# .github

## Purpose

GitHub-specific configuration: CI/CD workflows, issue and PR templates, dependabot rules, sponsorship configuration, and release-drafter notes. Touch with care — most files here gate every PR.

## Key Files

| File                       | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `FUNDING.yml`              | GitHub Sponsors / Open Collective links shown on the repo. |
| `dependabot.yml`           | Dependabot schedule and grouping rules.                    |
| `release.yml`              | Release Drafter / GitHub Releases notes config.            |
| `PULL_REQUEST_TEMPLATE.md` | Default PR description template.                           |

## Subdirectories

| Directory         | Purpose                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ISSUE_TEMPLATE/` | Issue form templates (bug report, feature request) (see `ISSUE_TEMPLATE/AGENTS.md`).                                                                       |
| `workflows/`      | GitHub Actions workflows for testing, linting PRs, contributor trust, releases, stale issue maintenance, and store submission (see `workflows/AGENTS.md`). |
| `scripts/`        | Helper scripts called from workflows (see `scripts/AGENTS.md`).                                                                                            |

## For AI Agents

### Working In This Directory

- **Workflows guard every PR.** Editing them affects everyone immediately. Validate locally with `act` (or in a fork) before pushing.
- Do not add secrets to workflow YAML — only reference `${{ secrets.X }}` and configure the secret in repository settings.
- Use composite actions / reusable workflows when patterns repeat across files.

### Testing Requirements

- Lint PR workflow already validates PR titles via commitlint conventions; do not bypass.
- Push to a fork to dry-run any workflow change before merging.

### Common Patterns

- Workflows pin action versions by commit SHA where security matters; otherwise by major tag.
- pnpm caching uses the official `pnpm/action-setup` action.

## Dependencies

### External

- GitHub Actions runners (`ubuntu-latest` typical).
- Third-party actions (changesets, claude, etc.) — review when bumping.

<!-- MANUAL: -->
