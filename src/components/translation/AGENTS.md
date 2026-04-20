<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# translation

## Purpose

Shared inline UI rendered alongside translated DOM nodes inside the page (content scripts). Today the only sub-feature is the error/retry pair shown when an in-page translation request fails - the broader inline-translation rendering happens in `@/utils/host/translate/*`, while this folder hosts the React surfaces those host scripts mount.

## Key Files

This directory has no top-level files - only subdirectories.

## Subdirectories

| Directory | Purpose                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `error/`  | Inline error indicator + retry button shown when a translation API call fails. (see `error/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- New components added here should be safe to render inside Shadow DOM hosts: import `ShadowWrapperContext` from `@/utils/react-shadow-host/create-shadow-host` and pass `container={shadowWrapper}` to any portal-based primitive (`HoverCard`, `Tooltip`, `Sheet`, etc.).
- Add the `notranslate` class to root containers so Chrome's built-in page translator doesn't double-translate UI chrome.
- Keep components small and inline - they sit between translated text nodes and inherit page typography.

### Testing Requirements

- Vitest + `@testing-library/react`. Co-locate tests under `<sub>/__tests__/`. Provide a stub `ShadowWrapperContext` value when the component portals popups.

### Common Patterns

- Inline `flex` rows with small icon buttons (`size-4`) and tight padding (`px-1.5`).
- Action handlers come from `@/utils/host/translate/node-manipulation` (e.g. `translateNodesBilingualMode`) so retries reuse the same pipeline as the initial translation.

## Dependencies

### Internal

- `@/utils/react-shadow-host/create-shadow-host#ShadowWrapperContext`.
- `@/utils/host/translate/node-manipulation` - retry helpers.

### External

- `react@19` - `use(...)` for context.
- `ai` - `APICallError` type from Vercel AI SDK.

<!-- MANUAL: -->
