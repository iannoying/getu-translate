<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# scripts

## Purpose

Helper scripts invoked from GitHub Actions workflows. Distinct from the repo-level `/scripts/` (which is for developer-run scripts) — these are CI-only.

## Subdirectories

| Directory            | Purpose                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contributor-trust/` | Logic used by `../workflows/pr-contributor-trust.yml` to decide whether a PR from a new contributor should run paid CI / be auto-approved (see `contributor-trust/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Scripts here run on the GitHub Actions runner. Keep dependencies minimal and pin them.
- Surface failures clearly — workflow logs are the only debugging surface.

## Dependencies

### External

- Node, pnpm, and whatever each subdirectory pulls in.

<!-- MANUAL: -->
