<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# components

## Purpose

Cross-entrypoint React component library for the Read Frog extension. Combines low-level UI primitives (`ui/` shadcn-generated + `ui/base-ui/` wrappers around `@base-ui/react`) with feature-specific composites (language pickers, prompt configurator, provider selectors, recovery boundaries, frog-styled toasts) consumed by the options page, popup, side panel, content scripts, and selection overlay. Almost every component pulls from Tailwind v4 utilities through `@/utils/styles/utils#cn` and reads i18n strings via the WXT `#imports` `i18n.t` helper.

## Key Files

| File                           | Description                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-config-warning.tsx`       | Banner shown when no API key is configured; deep-links to options page via `sendMessage("openOptionsPage")`.                                                                                                     |
| `container.tsx`                | Default-exported max-width responsive layout wrapper (`max-w-7xl` + responsive horizontal padding).                                                                                                              |
| `gradient-background.tsx`      | Decorative section background combining radial gradients with an inline SVG `feTurbulence` noise filter (id from `useId`).                                                                                       |
| `help-button.tsx`              | Floating draggable help button that snaps to top-right / bottom-right and persists corner in `localStorage`; opens GitHub issues on click.                                                                       |
| `help-tooltip.tsx`             | Inline `?` icon wrapped in a `Tooltip` that surfaces hint text.                                                                                                                                                  |
| `language-combobox-options.ts` | Pure helpers: `getLanguageItems`, `getLanguageLabel`, `filterLanguage` built on `langCodeISO6393Schema` + i18n.                                                                                                  |
| `language-combobox.tsx`        | Single-select language picker with optional `auto` entry tagged by `AutoBadge`.                                                                                                                                  |
| `llm-status-indicator.tsx`     | Green/orange dot + i18n label indicating whether an LLM provider is configured for a feature.                                                                                                                    |
| `loading-dots.tsx`             | Three bouncing dots loading indicator (default export).                                                                                                                                                          |
| `markdown-renderer.tsx`        | `react-markdown` wrapper with custom `h1`-`h4`, `p`, `ul`, `blockquote` styling using Tailwind.                                                                                                                  |
| `multi-language-combobox.tsx`  | Multi-select language combobox built on `@base-ui/react/combobox` `Trigger` for popover-style behavior.                                                                                                          |
| `provider-icon.tsx`            | Renders provider logos; proxies cross-origin URLs through background via `resolveContentScriptAssetBlob` and draws the result onto a DPR-aware `<canvas>` when needed. Exposes `cva` size variants `sm` -> `xl`. |
| `shortcut-key-recorder.tsx`    | Read-only `<Input>` that records keyboard shortcuts (uses `@tanstack/hotkeys#isModifierKey`); Escape cancels, Backspace/Delete clears.                                                                           |
| `sortable-list.tsx`            | Generic vertical-axis `dnd-kit` sortable list with drag overlay; preserves scroll position after reorder.                                                                                                        |
| `test-orpc.tsx`                | Commented-out scaffold for testing the oRPC client (kept as reference).                                                                                                                                          |
| `thinking.tsx`                 | Collapsible "AI thinking" panel driven by `ThinkingSnapshot`; auto-scrolls content while thinking unless the user scrolls away.                                                                                  |
| `user-account.tsx`             | Header avatar/name pulled from `authClient.useSession()`, with a Log in button when unauthenticated.                                                                                                             |

## Subdirectories

| Directory              | Purpose                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `badges/`              | Status / variant badges built on `ui/base-ui/badge`. (see `badges/AGENTS.md`)                               |
| `form/`                | `@tanstack/react-form` field adapters bound to `ui/base-ui` primitives. (see `form/AGENTS.md`)              |
| `frog-toast/`          | `sonner` Toaster wrapper using the Read Frog icon and shadow-DOM-safe z-index. (see `frog-toast/AGENTS.md`) |
| `icons/`               | Custom SVG icon components (e.g. animated thinking dots). (see `icons/AGENTS.md`)                           |
| `llm-providers/`       | Provider selection UI for AI / translate providers. (see `llm-providers/AGENTS.md`)                         |
| `prompt-configurator/` | UI for authoring/editing/exporting custom translation prompts. (see `prompt-configurator/AGENTS.md`)        |
| `providers/`           | React context providers (theme, etc.). (see `providers/AGENTS.md`)                                          |
| `recovery/`            | Error-boundary fallback that lets users export config and reset to defaults. (see `recovery/AGENTS.md`)     |
| `translation/`         | Shared translation-display components (currently the error/retry surface). (see `translation/AGENTS.md`)    |
| `ui/`                  | Tailwind v4 + base-ui-driven UI primitives plus a custom selection popover. (see `ui/AGENTS.md`)            |

## For AI Agents

### Working In This Directory

- Auto-imports are disabled. Always import explicitly; use the `@/*` alias (e.g. `@/components/ui/base-ui/button`).
- Pull WXT browser globals (`browser`, `i18n`) from `#imports`, never from `webextension-polyfill` directly.
- Reuse `cn(...)` from `@/utils/styles/utils` for className merging; never hand-roll a `clsx` import.
- Components rendered inside content-script shadow hosts must read `ShadowWrapperContext` (see `translation/error/error-button.tsx`) and pass `container` to portal-based primitives so popups land inside the shadow root.
- Locales come from `i18n.t(...)`; when a key is dynamic, cast through `as Parameters<typeof i18n.t>[0]` like `language-combobox-options.ts`.
- The toast layer is `frog-toast/`, not raw `sonner`; use `import { toast } from "sonner"` for calls, but mount only `<FrogToast />`.

### Testing Requirements

- Vitest + `@testing-library/react`. Tests live in co-located `__tests__/` folders (e.g. `ui/base-ui/__tests__`, `translation/error/__tests__`). Render with `render()`, drive interactions through `userEvent`, and assert via accessible queries.
- Mock WXT modules (`#imports`) and any `@/utils/atoms/*` Jotai stores; provide a Jotai `Provider` per test if state is involved.
- Skip writing tests inside `__tests__/` from documentation generators - those folders are intentionally not documented.

### Common Patterns

- Variant primitives use `class-variance-authority` (`cva`) with `VariantProps` types (`provider-icon.tsx`, `ui/base-ui/button.tsx`, `ui/base-ui/badge.tsx`).
- Base UI integration usually goes through `useRender` + `mergeProps` from `@base-ui/react` so any wrapper accepts a `render={...}` prop (badge, selection-popover slots).
- Forms compose `Field`/`FieldLabel`/`FieldError` from `ui/base-ui/field` with `useFieldContext` from `form/form-context`.
- State leans on Jotai atoms from `@/utils/atoms/*` (config, theme); contexts (`createContext` + `use(...)` from React 19) are reserved for prop drilling that doesn't need persistence.
- Heavy interactive components (drag/resize popovers, code editors) ship hooks alongside the component (e.g. `selection-popover/use-selection-popover-layout.ts`).

## Dependencies

### Internal

- `@/utils/styles/utils#cn` for class merging.
- `@/utils/atoms/*` (`config`, `theme`) and `@/utils/auth/auth-client` for shared client state.
- `@/utils/message#sendMessage` for cross-context messaging (`api-config-warning.tsx`).
- `@/utils/constants/*` for `APP_NAME`, prompt defaults, provider catalog.
- `@/utils/host/translate/node-manipulation` for retrying inline translations.
- `@/hooks/*` (`use-export-config`, `use-mobile`).

### External

- `react@19` + `react-dom` (uses `Activity` and the new `use(...)` API).
- `@base-ui/react` - unstyled primitives backing `ui/base-ui/*`.
- `@tabler/icons-react`, `@iconify/react`, `@remixicon/react` - icon sets.
- `class-variance-authority` - variant builders for primitives.
- `sonner` - toast engine, wrapped by `frog-toast/`.
- `react-markdown` - markdown rendering for chat/output.
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` - sortable lists.
- `react-rnd` - resizable/draggable selection popover shell.
- `@uiw/react-codemirror` + `@codemirror/lang-css` + `@codemirror/lang-json` - in-app code editors.
- `@tanstack/react-form`, `@tanstack/hotkeys` - form state and shortcut parsing.
- `react-error-boundary` - error containment for the recovery surface.
- `file-saver` - downloads exported prompts/config.
- `case-anything` - kebab/camel casing for i18n keys and CSS class names.

<!-- MANUAL: -->
