<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# locales

## Purpose

i18n message catalogs consumed by `@wxt-dev/i18n` (registered as `@wxt-dev/i18n/module` in `wxt.config.ts`). Each YAML file is one locale; WXT compiles them into the extension's `_locales/<lang>/messages.json` at build time so `i18n.t("key.path")` from `#imports` returns the active translation. `en.yml` is the canonical source — every other locale should mirror its key shape.

## Key Files

| File        | Description                                                   |
| ----------- | ------------------------------------------------------------- |
| `en.yml`    | Canonical English catalog. Source-of-truth for keys (~50 KB). |
| `zh-CN.yml` | Simplified Chinese translation.                               |
| `zh-TW.yml` | Traditional Chinese translation.                              |
| `ja.yml`    | Japanese translation.                                         |
| `ko.yml`    | Korean translation.                                           |
| `ru.yml`    | Russian translation.                                          |
| `tr.yml`    | Turkish translation.                                          |
| `vi.yml`    | Vietnamese translation.                                       |

YAML structure (representative top-level keys, see `en.yml` for the full tree):

- `name`, `extName`, `extDescription` — extension manifest strings
- `uninstallSurveyUrl` — non-translated URL
- `dataTypes` — UI labels for primitive output types (`string`, `number`)
- `contextMenu` — Chrome context-menu entries (uses `%s` placeholder for selection text)
- `popup` — toolbar popup UI: theme toggle, language selectors, blacklist/whitelist actions, `more` submenu, `hub.tooltip`, `discord.tooltip`, `blog.notification`
- `errorRecovery` — recovery-mode dialog (export, reset, error details)
- `options` — settings page: `commandPalette`, `sidebar`, `tools.translationHub`, `apiProviders`, `betaExperience`, plus deeply nested feature configuration trees (translate, tts, subtitles, selection toolbar, etc.)
- `speak`, `speech` — TTS user-facing strings consumed by `useTextToSpeech` and the toolbar speak button

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Add new keys to `en.yml` first, then mirror the key path into every other locale (missing keys fall back to English at runtime but ship as visible English strings — that's a UX bug).
- Look up keys with `i18n.t("path.to.key")` after `import { i18n } from "#imports"`. Never construct the key path with template literals — `@wxt-dev/i18n`'s codegen relies on static literal arguments for type-checking.
- Preserve the `%s` placeholder in `contextMenu.translateSelection` (Chrome substitutes the selected text) and any other ICU-style placeholders verbatim.
- File format is YAML, not JSON — keep two-space indentation and avoid tabs. Quoted strings are needed only when the value starts with a YAML special char (`{`, `[`, `:`, `#`, `?`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`).
- The locale code in the filename (`zh-CN`, `zh-TW`, `pt-BR`, etc.) is what Chrome's `chrome.i18n.getUILanguage()` returns; do not rename existing files without updating the WXT i18n manifest.
- Do NOT translate the `name` value — it must stay `Read Frog` so users can find the extension by its English brand name.

### Testing Requirements

No automated tests for catalogs themselves. CI will fail at build time if YAML is malformed; key-coverage drift is currently caught manually.

### Common Patterns

- Two-level namespacing per surface (`popup.more.translationHub`, `options.apiProviders.title`) so React components can pull a whole sub-tree.
- Tooltip strings live under `<feature>.tooltip` for consistency.
- Booleans/limits stay in TS; locales only carry user-facing copy.

## Dependencies

### Internal

Consumed by every UI surface via `i18n.t(...)` from `#imports` (see `src/components/`, `src/entrypoints/popup/**`, `src/entrypoints/options/**`, `src/entrypoints/*.content/**`).

### External

- `@wxt-dev/i18n` (registered in `wxt.config.ts` modules) — compiles YAML to Chrome's `_locales/messages.json` and provides the typed `i18n.t` runtime.

<!-- MANUAL: -->
