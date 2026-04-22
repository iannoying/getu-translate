---
"@getu/extension": patch
---

feat: M3 PR#B2 — translation scheduler + progressive rendering

- `TranslationScheduler` with concurrency 6 (configurable), AbortSignal support, dedup + error-retry semantics
- Per-viewer Jotai Provider + shared store (replaces direct storageAdapter writes)
- `segmentStatusAtomFamily` drives per-paragraph UI state (pending → translating → done | error)
- Overlay slots render real translations progressively via `<SegmentContent>`, replacing `[...]` placeholders as each provider call returns
- First-use toast "Accept" now wired: flips `enqueuePolicy` from "blocked" to "enabled" and retro-enqueues all known paragraphs
- Scheduler reuses existing `translateTextForPage` pipeline (free/AI dispatch + hash cache)
- No quota / cache yet — PR #B3 adds daily page limits + file-hash cache
