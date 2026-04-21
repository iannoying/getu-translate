<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# scripts

## Purpose

Repo-level maintenance and tooling scripts that are NOT part of the extension build. Run via `pnpm` or `npx tsx`. These scripts may touch the network (e.g. scraping), generate JSON artifacts under `scripts/output/`, or provide one-off debugging helpers for use inside a browser DevTools console.

## Key Files

| File                               | Description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scrape-ai-sdk-provider-models.ts` | Scrapes the Vercel AI SDK documentation site to produce a normalized JSON catalog of every supported provider's models and their capabilities (image input, audio input, object generation, tool usage). Called via `pnpm scrape:ai-sdk-models`, which writes to `scripts/output/ai-sdk-provider-models.json`. Used to keep the in-extension provider/model picker in sync with upstream. Uses `jsdom` and `node:fs/promises`. |

## Subdirectories

| Directory | Purpose                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `debug/`  | Browser-side debug snippets pasted into DevTools (see `debug/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- These scripts run on **Node ≥ 22** with `tsx` (no compile step).
- Scripts that hit the network (the AI-SDK scraper) should remain **idempotent** and tolerant of upstream HTML changes — preserve the existing `ErrorEntry` reporting pattern when extending.
- **Do not** add scripts here that need to run as part of the extension build pipeline; those belong in `wxt.config.ts` Vite plugins instead.
- Output artifacts go under `scripts/output/` (gitignored or checked in case-by-case).

### Testing Requirements

- No automated tests — verify by running the script locally and inspecting the output JSON.
- For the scraper: spot-check at least three providers (one with all capabilities, one without audio, one with errors) to make sure normalization still works.

### Common Patterns

- Heavy use of `node:` built-ins (`node:fs/promises`, `node:path`, `node:process`).
- TypeScript interfaces declared at the top of each script document the data shape.

## Dependencies

### Internal

- The scraper output is consumed by code in `src/utils/providers/` and `src/components/llm-providers/`.

### External

- `jsdom` (devDependency) — HTML parsing.
- `tsx` (invoked via `npx tsx`) — TypeScript runner.

<!-- MANUAL: -->
