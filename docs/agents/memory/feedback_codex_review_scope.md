---
name: Codex review scope
description: Only run Codex cross-model review on substantial code PRs; skip for trivial config/docs/placeholder PRs
type: feedback
originSessionId: 0d3407cb-27ce-4f16-bf92-5de73a668d49
---
User directive: Skip Codex cross-model review for simple PRs. Use Claude `code-reviewer` only for those.

**Why:** Codex runs for several minutes digging through the repo; low ROI for trivial config / docs / empty placeholder PRs where Claude has already approved. Established during Phase 1 Task 1 (pnpm-workspace.yaml + 2 .gitkeep) where Codex spent >5 minutes on a 3-file config PR.

**How to apply:**
- **Skip Codex** when the PR is one of: workspace config only, README/docs only, empty placeholder package, CI yaml path tweaks, i18n-only string edits.
- **Run Codex** when the PR touches real source code: refactors, moves with history (e.g., `git mv` large trees), new features, new packages with real code, cross-cutting renames, brand replacement touching many components, TDD implementations.
- Codex sub-process will continue running even after we skip its verdict — not wasted; its final output is still available via the task output file and can be read as a free audit if it finishes.
