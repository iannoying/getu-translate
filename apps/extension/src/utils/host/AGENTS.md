<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# host

## Purpose

The "page host" engine — everything content scripts use to walk the live DOM, decide what to translate, fetch translations, and inject bilingual or translation-only content back into the page (with shadow-root style isolation, error boundaries, and force-block/inline heuristics). Split into a low-level `dom/` toolkit and a high-level `translate/` orchestration layer.

## Key Files

This directory has no top-level files — only subdirectories.

## Subdirectories

| Directory    | Purpose                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dom/`       | DOM walker / inline-vs-block classifier / shadow-root traversal / batched DOM ops (see `dom/AGENTS.md`).                                                                 |
| `translate/` | Translation orchestration: provider routing, prompt assembly, wrapper insertion, page-context summary, auto-translation gating, ui spinners (see `translate/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- This directory is content-script land — assume `window`/`document` exist but treat shadow roots as first-class (use `getContainingShadowRoot` and `deepQueryTopLevelSelector` from `dom/`).
- Never call DOM APIs synchronously in tight loops — go through `batchDOMOperation` from `dom/batch-dom.ts` to coalesce writes per animation frame.
- All translation entry points share the same labelling protocol: `walkAndLabelElement(...walkId...)` then `translateWalkedElement(...walkId...)` so re-entrant runs are safe and a stale walk can be ignored by id mismatch.
- `translate/` reads config via `getLocalConfig()` (sync from storage) and dispatches actual provider calls through `sendMessage` to the background queue; don't bypass the queue for retry/back-pressure reasons.

### Testing Requirements

- Vitest with co-located `__tests__/` directories under `dom/` and `translate/`. DOM tests run in `happy-dom` / `jsdom`-ish environments; shadow-root behavior is tested directly.
- `SKIP_FREE_API=true` is required to skip live network calls when running the full suite — `translate/api/__tests__/free-api.test.ts` (under `translate/api/`) hits real Google/Microsoft translate endpoints. See `translate/AGENTS.md` for the exact env flag wiring.

### Common Patterns

- Walk-and-label-then-translate two-phase pass — phase 1 mutates only data attributes, phase 2 inserts wrappers.
- Owner-document awareness — every wrapper-creating helper resolves `getOwnerDocument(node)` so inserts work inside iframes/shadow roots.
- Symbol-free state via `WeakSet` (`translatingNodes`) and `WeakMap` (`originalContentMap`) keyed on the live nodes.

## Dependencies

### Internal

- `@/types/config/config`, `@/types/config/provider`, `@/types/dom`, `@/types/content`
- `@/utils/config/storage`, `@/utils/config/languages`
- `@/utils/constants/dom-labels`, `@/utils/constants/dom-rules`, `@/utils/constants/translation-node-style`
- `@/utils/content/language`, `@/utils/content/utils`, `@/utils/content/language-direction`
- `@/utils/message`, `@/utils/hash`, `@/utils/url`, `@/utils/logger`, `@/utils/prompts/translate`

### External

- `@read-frog/definitions` — language code maps
- `@mozilla/readability` — main-content extraction for AI context
- `case-anything` — attribute name conversion
- `sonner` — toast notifications

<!-- MANUAL: -->
