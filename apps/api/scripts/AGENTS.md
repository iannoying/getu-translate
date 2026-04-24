<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# scripts

## Purpose

One-off maintenance scripts run via `tsx` against the production DB (or locally via `.env.local`). Not part of the worker bundle.

## Key Files

| File             | Description                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `grant-pro.ts`   | Manually grants a user a Pro entitlement. Run via `pnpm --filter @getu/api grant-pro`.                    |

## For AI Agents

- Scripts here may read/write prod data — confirm destination before running.
- Require an explicit flag or argument for any destructive/mutating action; never operate silently.
- Prefer adding a new script over editing `grant-pro.ts` when the semantics differ.

<!-- MANUAL: -->
