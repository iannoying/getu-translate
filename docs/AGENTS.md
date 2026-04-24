<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# docs

## Purpose

Developer documentation that doesn't belong in user-facing READMEs: per-milestone implementation plans, API contract specs, infrastructure runbooks, and the AI agent session-memory index. None of this ships to end users; it's addressed to future contributors and agents working in the repo.

## Subdirectories

| Directory      | Purpose                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `plans/`       | Dated milestone + PR plans (`YYYY-MM-DD-<slug>.md`). M0–M5 design + per-PR execution, Phase 2–5 auth/billing/stripe, web i18n, etc.       |
| `contracts/`   | API contract specs, e.g. `billing.md` — the canonical description of pricing / checkout / entitlement flows.                              |
| `infra/`       | Deployment + environment runbooks (`phase2-deploy-runbook.md`, `README.md`) covering Cloudflare Workers/Pages, D1, secrets, OAuth redirects. |
| `agents/memory/` | Durable session memory (`MEMORY.md` + per-topic files) surfaced to AI agents on session start. See the Session Memory section of the root `AGENTS.md`. |

## For AI Agents

### Working In This Directory

- **Plans are append-only history.** Treat dated files as immutable — if a plan is superseded, write a new one and link it, don't rewrite the old one.
- **`plans/` naming is `YYYY-MM-DD-<slug>.md`.** Create plans at the start of a milestone via `superpowers:writing-plans`; commit before any code lands.
- **Contracts in `contracts/` are authoritative.** If `billing.md` disagrees with the code, either update the doc (with a commit explaining why) or fix the code — never silently diverge.
- **Memory (`agents/memory/`) is the first thing to read before non-trivial work.** See the root AGENTS.md. Keep it current as lessons accumulate.
- **Infra runbooks describe real deploys.** Don't add hypothetical steps — test a procedure, then document exactly what worked.

## Related

- Milestone execution workflow lives in the root `AGENTS.md` and `/milestone-run`.
- Each milestone has a corresponding epic issue + sub-issues on GitHub; plans here link back.

<!-- MANUAL: -->
