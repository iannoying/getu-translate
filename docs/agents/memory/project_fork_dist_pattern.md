---
name: Fork @read-frog/* npm package pattern
description: How to fork @read-frog/* npm packages into packages/* since upstream monorepo is private (404 on GitHub)
type: project
originSessionId: 0d3407cb-27ce-4f16-bf92-5de73a668d49
---
`mengxi-ream/read-frog-monorepo` does not exist/is private on GitHub (verified 2026-04-21 via `gh repo view mengxi-ream/read-frog-monorepo` → 404). Task 3 established this pattern for `@getu/definitions`; Task 4 should mirror it for `@getu/contract`.

**Why:** The original plan assumed upstream source could be cloned. Without upstream, the only available source is the compiled npm dist (`node_modules/@read-frog/<pkg>/dist/{index.js,index.d.ts}`).

**How to apply:**
- `packages/<pkg>/src/base.js` = verbatim upstream dist `.js` (strip sourceMappingURL)
- `packages/<pkg>/src/base.d.ts` = upstream `.d.ts` with value edits for URL/domain constants if needed
- `packages/<pkg>/src/index.ts` = **explicit named re-export** (NOT `export *`) from `./base.js`, listing every symbol consumers actually need. Do NOT include readfrog-legacy names (e.g., `READFROG_DOMAIN`). Then add `export const X = ...` for any override values.
- `package.json` has `"main": "./src/index.ts"` + `"types": "./src/index.ts"` — bundler-only; add a NOTE comment at top of `index.ts` explaining.
- No build step, no `dist/` output, no tsup — internal workspace package resolves via wxt/vite bundler graph.
- Defer `APP_NAME` and other brand-value renames to Phase 1 Task 5 (single dedicated PR for brand strings).
