---
name: Check for pre-existing extension code before implementing
description: Before writing new extension-side code, always grep for existing implementation; M0 commercialization prep work left many deliverables already half-done.
type: project
originSessionId: 0d3407cb-27ce-4f16-bf92-5de73a668d49
---
The extension repo was forked with **significant M0 commercialization scaffolding already in place** (entitlements types, Dexie cache, `useEntitlements` hook, `useInputTranslationQuota`). Multiple Phase 2 tasks discovered their "deliverable" was already 90% done.

**Before creating any extension file for Phase 3+:**

1. `grep -rn "<symbol>" apps/extension/src/` — look for pre-existing hook/type/util.
2. `ls apps/extension/src/hooks/` and `apps/extension/src/utils/atoms/` — scan for half-finished modules.
3. `git log --follow apps/extension/src/<path>` — see when it was added.
4. If exists: audit against the Task's behavior contract. If meets spec, add ONLY missing tests. If partial, fill the gap. If wrong, rewrite with a note.

Phase 2 concrete examples:
- Task 6 `entitlements_cache` Dexie table: **already existed** at `tables/entitlements-cache.ts` + helpers in `dexie/entitlements.ts`. Only missing: the spec-required test path `tables/__tests__/entitlements-cache.test.ts`.
- Task 7 `useEntitlements` hook: **already existed** with tanstack-query + Jotai + Dexie fallback + 12 tests. Only missing: wiring `fetch-entitlements.ts` from stub to real `orpcClient.billing.getEntitlements` call.
- Task 10 `useInputTranslationQuota` Pro bypass: **already existed** with `isPro(ent) || features.includes("input_translate_unlimited")` short-circuit. Only missing: the 60-consecutive-Pro-call test.

**How to apply:**
- Always phrase Task dispatch as "investigate first, then fill gaps" rather than "implement from scratch".
- Include an `EXISTING_WORK_FOUND` field in subagent report format.
- If found, do NOT rewrite — respect existing signatures; downstream consumers depend on them.
- If rewriting is the right call, note what was replaced in PR body.
