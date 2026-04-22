---
name: Skip Codex review entirely
description: Do not use codex:codex-rescue or any Codex subagent for code review; use Claude agents only
type: feedback
---
User directive (2026-04-22, mid Phase 3 execution): stop using Codex for code review. Use only Claude subagents (`code-reviewer`, `general-purpose` for spec compliance).

**Why:** Multiple Codex review runs during Phase 3 hung without producing a verdict — Task 1's Codex review stuck at "Turn started" for 5+ min, Task 3's Codex stalled 14+ min after reading all files. Blocks the pipeline and the second opinion rarely adds value over Claude's review. Supersedes the earlier `feedback_codex_review_scope.md` rule about running Codex on substantial code changes.

**How to apply:**
- Skip Codex even on "substantial code" PRs (refactors, new features, cross-cutting renames). Rely on Claude `code-reviewer` only.
- Still use two-stage review per superpowers:subagent-driven-development: spec compliance (general-purpose) → code quality (code-reviewer).
- If a truly critical correctness question arises that Claude can't answer (e.g., "is D1 batch transactional?"), have the implementer verify by reading authoritative docs/source rather than calling Codex.
- The earlier `feedback_codex_review_scope.md` memory is superseded — do not consult it.
