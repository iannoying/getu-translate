<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# contributor-trust

## Purpose

Implements the contributor-trust check used by `../../workflows/pr-contributor-trust.yml`. Decides whether a PR author is "trusted" (existing maintainer / past contributor) or "first-time", and gates expensive / sensitive CI accordingly.

## For AI Agents

### Working In This Directory

- Read the workflow file (`../../workflows/pr-contributor-trust.yml`) to see how this script is invoked and what env vars / inputs it receives.
- Decisions made here affect security posture (whether untrusted PRs can run code that touches secrets). Be conservative.
- Keep the runtime self-contained — no `pnpm install` of the project's full dependency tree if avoidable; prefer Node built-ins or a tiny dependency surface.

### Testing Requirements

- Validate by triggering the workflow on a fork PR (trusted vs. first-time author).

## Dependencies

### Internal

- Wired in via `.github/workflows/pr-contributor-trust.yml`.

### External

- Node + whatever this folder declares locally.

<!-- MANUAL: -->
