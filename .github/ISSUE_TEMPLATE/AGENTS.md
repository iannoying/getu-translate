<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# ISSUE_TEMPLATE

## Purpose

GitHub issue form templates that surface in the "New Issue" UI on the repository.

## Key Files

| File                  | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `bug_report.yml`      | Structured bug report form (browser version, repro steps, screenshots). |
| `feature_request.yml` | Structured feature request form.                                        |
| `config.yml`          | Issue chooser configuration (e.g. blank-issues policy, contact links).  |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Schemas follow GitHub's [issue form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms).
- When adding required fields, verify they don't break existing automation that may parse the issue body.
- `config.yml` controls whether users can open blank issues; changing this affects how triage works.

## Dependencies

None.

<!-- MANUAL: -->
