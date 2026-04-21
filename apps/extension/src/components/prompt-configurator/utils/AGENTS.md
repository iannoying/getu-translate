<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# utils

## Purpose

Pure file-I/O helpers backing the prompt configurator's import/export feature. Serializes selected prompts to a `<APP_NAME>_prompts.json` blob via `file-saver`, parses uploaded JSON back into a `PromptConfigList`, and validates each entry with a minimal "must have `name` and `prompt`" check before resolving the promise.

## Key Files

| File             | Description                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt-file.ts` | Exports `PromptConfig`/`PromptConfigList` types (`Omit<TranslatePromptObj, "id">`), `checkPromptConfig`, `downloadJSONFile`, and `analysisJSONFile`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Keep these helpers free of React or Jotai imports - they run in any context (options page, popup) and the import flow already wraps results into id-bearing prompts upstream.
- Validation is intentionally permissive (`name && prompt`); add stricter Zod parsing in `@/types/config/translate` if you tighten requirements, not here.
- `analysisJSONFile` returns a Promise that rejects with an `Error("Prompt config is invalid")` on shape mismatch and forwards `JSON.parse` errors. The caller (`import-prompts.tsx`) toasts those messages, so keep them human-readable.
- The download filename is `${APP_NAME}_prompts.json`; reuse `APP_NAME` from `@/utils/constants/app` so renaming the product propagates.

### Testing Requirements

- Vitest. `downloadJSONFile` -> mock `file-saver#saveAs` and assert the blob payload and filename. `analysisJSONFile` -> use a `File`/`Blob` polyfill, exercise valid, invalid-shape, and malformed-JSON cases. `checkPromptConfig` -> straightforward unit table.

### Common Patterns

- `Omit<TranslatePromptObj, "id">` for export shape so old files remain importable across schema bumps - ids are regenerated on import.
- `FileReader` Promise wrapper instead of `await blob.text()` to keep error semantics aligned with older Chromium content scripts where `Blob.text()` may be missing in shadow contexts.

## Dependencies

### Internal

- `@/types/config/translate#TranslatePromptObj`.
- `@/utils/constants/app#APP_NAME`.

### External

- `file-saver` - cross-browser download trigger.

<!-- MANUAL: -->
