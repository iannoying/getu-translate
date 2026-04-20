<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# .changeset

## Purpose

Pending [Changesets](https://github.com/changesets/changesets) — markdown files that describe user-facing changes, their semver bump (patch/minor/major), and feed `CHANGELOG.md` and the version bump PR.

## Key Files

| File | Description |
|------|-------------|
| `config.json` | Changesets config. Uses `@changesets/changelog-github` against `mengxi-ream/read-frog`. `commit: false`, `access: restricted`, base branch `main`, `updateInternalDependencies: patch`, `privatePackages.version/tag: true`. |
| `README.md` | Boilerplate intro from the Changesets CLI. |
| `*.md` (e.g. `bright-tools-begin.md`, `clever-forks-smile.md`, ...) | One pending changeset per file. The frontmatter declares the bump, the body becomes the changelog entry. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Add a changeset for every user-visible change.** Run `pnpm changeset` interactively, or create a file by hand using the existing format:
  ```markdown
  ---
  "@read-frog/extension": patch
  ---

  Short description of the change.
  ```
- Wording goes directly to release notes — write for end users, not implementation details.
- The release workflow (`.github/workflows/release.yml`) consumes everything here, opens a "Version Packages" PR, and on merge tags + publishes.
- **Do not delete pending changesets manually.** Let the release workflow consume them.

### Testing Requirements

- After adding a changeset, verify with `pnpm exec changeset status`.

## Dependencies

### External

- `@changesets/cli`, `@changesets/changelog-github` (devDependencies in root `package.json`).

<!-- MANUAL: -->
