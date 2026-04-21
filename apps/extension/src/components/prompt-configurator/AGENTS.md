<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# prompt-configurator

## Purpose

Self-contained UI for managing user-defined translation prompts (system + user templates). Wraps a `ConfigCard` from the options page and exposes a card grid where users can browse, select-as-current, edit, delete, import, and export prompts. State flows through a `PromptConfiguratorContext` that holds three Jotai atoms (`config`, `exportMode`, `selectedPrompts`); consumers create those atoms once via `createPromptAtoms(configAtom)` and pass them in as `promptAtoms`. The default prompt (id from `DEFAULT_TRANSLATE_PROMPT_ID`) is constructed in-memory and prepended to the user list - it is never stored.

## Key Files

| File                   | Description                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`            | Public entrypoint. Exports `PromptConfigurator` plus the `usePromptAtoms`/`PromptAtoms`/`CustomPromptsConfig` types. Wraps children in `PromptConfiguratorContext` + `ConfigCard` and renders `<PromptList />`. |
| `context.tsx`          | Defines `PromptConfiguratorContext`, `PromptAtoms`, `PromptInsertCell`, plus the `usePromptAtoms`/`usePromptInsertCells` hooks (use React 19 `use(...)`).                                                       |
| `create-atoms.ts`      | `createPromptAtoms(configAtom)` derives a writable `customPromptsConfig` atom plus `exportMode` / `selectedPrompts` UI atoms.                                                                                   |
| `prompt-list.tsx`      | Top toolbar (Import / Export / Add / Cancel) + `<PromptGrid />`. Toggles `exportMode` and resets selection on cancel.                                                                                           |
| `prompt-grid.tsx`      | Responsive 1/2/4-column grid of prompt cards. Manages active highlight, export-mode checkboxes, and click handling (default prompt is read-only).                                                               |
| `configure-prompt.tsx` | `<Sheet>` form for create/edit/view; uses `QuickInsertableTextarea` with `insertCells` for token chips and disables fields for the default prompt.                                                              |
| `delete-prompt.tsx`    | `AlertDialog` confirmation; if the deleted prompt was the active one, clears `promptId` to `null`.                                                                                                              |
| `export-prompts.tsx`   | Strips ids and writes the selected prompts to a JSON file via `downloadJSONFile`.                                                                                                                               |
| `import-prompts.tsx`   | Hidden `<input type="file">` triggered by a styled label; parses with `analysisJSONFile`, reassigns ids, backfills missing `systemPrompt`, and toasts success/failure.                                          |

## Subdirectories

| Directory | Purpose                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `utils/`  | File I/O helpers (`downloadJSONFile`, `analysisJSONFile`, `checkPromptConfig`). (see `utils/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Always go through `createPromptAtoms(configAtom)` from a parent. The components throw if used outside `<PromptConfigurator>` because `usePromptAtoms` calls `use(PromptConfiguratorContext)` and asserts non-null.
- The default prompt is virtual: never persist `DEFAULT_TRANSLATE_PROMPT_ID` into `config.patterns`. `prompt-grid.tsx` synthesizes it from constants in `@/utils/constants/prompt`.
- Selection / export-mode UX uses React 19 `<Activity mode="visible|hidden">` to keep DOM state alive while toggling visibility. Don't replace with conditional rendering unless you accept losing focus/transition state.
- `getRandomUUID()` from `@/utils/crypto-polyfill` is the only id source - both `configure-prompt.tsx` and `import-prompts.tsx` reuse it. Crypto APIs vary across content-script vs options contexts, so use the polyfill.
- When editing the `Sheet` form, remember `disabled={isDefault}` is what guards the read-only default prompt; keep it on every input.
- Use `i18n.t("options.translation.personalizedPrompts.*")` for all strings.

### Testing Requirements

- Vitest + `@testing-library/react`. Provide a Jotai `Provider` with a stub config atom, then wrap renders in `<PromptConfigurator promptAtoms={...} insertCells={[...]} ...>`. Mock `#imports` for `i18n.t` and `@/utils/crypto-polyfill#getRandomUUID` to make ids deterministic.

### Common Patterns

- Atom factory pattern (`createPromptAtoms`) so the same UI can target different config atoms (translate vs read).
- Splitting "selection state" (`selectedPrompts`, `exportMode`) from "config state" lets persisted config survive transient UI mode changes.
- Cards use shadcn `Card`/`CardHeader`/`CardContent`/`CardFooter`/`CardAction` from `ui/base-ui/card` with `cursor-pointer hover:scale-[1.02]` for tactile feedback.
- Import flow normalizes the file with `?? ""` for `systemPrompt` to keep older exports compatible.

## Dependencies

### Internal

- `@/entrypoints/options/components/config-card` - card chrome.
- `@/components/ui/base-ui/*` (`alert-dialog`, `badge`, `button`, `card`, `checkbox`, `field`, `input`, `label`, `separator`, `sheet`).
- `@/components/ui/insertable-textarea` - tokenized prompt textarea.
- `@/types/config/translate#customPromptsConfigSchema`, `TranslatePromptObj`.
- `@/utils/constants/prompt` - default prompt constants.
- `@/utils/crypto-polyfill#getRandomUUID`.
- `@/utils/styles/utils#cn`.
- `./utils/prompt-file` - JSON import/export.

### External

- `jotai` - `atom`, `useAtom`, `useAtomValue`, `useSetAtom`.
- `@iconify/react` - toolbar icons (`tabler:*`).
- `sonner` - toasts on import success/error.
- `react@19` - `use`, `Activity`, `useId`.

<!-- MANUAL: -->
