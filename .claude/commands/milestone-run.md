Run one milestone from the roadmap end-to-end: brainstorm → plan → issue → TDD PRs → adversarial review → merge.

**Input:** the milestone label — either an `M` tag (e.g. `M3`) or a plain title (e.g. `PDF 双语翻译`). If neither is given, ask which milestone the user wants.

## The loop

1. **Brainstorm** — invoke `superpowers:brainstorming` to explore scope, open questions, and constraints for this specific milestone. Reference the parent roadmap at `docs/plans/2026-04-20-roadmap-vs-immersive-translate.md` for what the milestone is supposed to deliver.
2. **Plan** — invoke `superpowers:writing-plans` and commit the resulting `docs/plans/YYYY-MM-DD-<milestone-slug>.md`.
3. **Worktree** — create an isolated worktree under `.claude/worktrees/<milestone-slug>` on a new branch `feat/<milestone-slug>`. Run `pnpm install` inside it.
4. **Open Epic issue** — `gh issue create` with label `milestone:m<N>` linking to the plan file; each planned PR gets its own sub-issue created from the plan's PR cut.
5. **Execute via `superpowers:executing-plans`** — one PR at a time. Per PR:
   - Each task follows strict TDD: failing test first, then minimal implementation, then commit.
   - After the last task, open the PR with `gh pr create --base main`, copy the plan's acceptance checklist into the PR body.
   - **In parallel** with CI: spawn the `codex:codex-rescue` subagent via `Agent` with instructions to run `/codex:adversarial-review` on that PR; give it the file list and concrete things to check. Run in background.
   - Wait for BOTH the adversarial review completion notification AND the CI watcher (`gh pr checks <num> --watch`, run in background).
   - Apply review fixes (only real issues — accept low-priority limitations with a reasoning comment). Push. Post a summary comment on the PR listing fixed / accepted / verified-clean findings.
   - `gh pr merge <num> --squash --auto`. Wait for merge notification.
6. **Loop** to next PR on the same milestone. Between PRs, create a fresh branch from the now-updated origin/main.
7. **Close epic** — when all PRs merged, `gh issue close <epic>` with a summary comment. Run `git worktree remove .claude/worktrees/<milestone-slug> --force`.

## Guardrails

- Never merge a PR whose CI is red or whose adversarial review surfaced a `HIGH` confirmed issue that isn't fixed.
- Worktree cwd is not preserved across `Bash` invocations — always `cd <absolute-path>` at the top of each command, or chain with `&&`.
- Config schema changes require: bumped `CONFIG_SCHEMA_VERSION`, a matching `migration-scripts/vNNN-to-vMMM.ts`, a matching `__tests__/example/vMMM.ts`, and a migration test. Run `pnpm wxt prepare` after adding i18n keys so `.wxt/types/i18n.d.ts` regenerates.
- Commits use conventional-commits, each PR comes with a `.changeset/*.md` bumping `@getu/extension`.
- Don't batch multiple milestones per session. One milestone per session, check in with the user before starting the next.

## When to stop and ask

- Plan calls for a breaking public API change.
- Adversarial review flags a security issue not covered by the plan.
- The milestone ends up needing > 3 PRs — stop and check if the scope should be narrowed.
