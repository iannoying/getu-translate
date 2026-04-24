<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-24 -->

# extension (@getu/extension)

## Purpose

The `@getu/extension` package is the GetU Translate browser extension, built with [WXT](https://wxt.dev) (a Vite-based browser-extension framework). Ships to Chrome, Edge, and Firefox (MV3). Feature surfaces:

- **Immersive page translation** — bilingual inline / side-panel translation.
- **Selection + input translation** — popover on text selection, inline translation in input fields (quota-gated on free tier).
- **PDF translation** — bundled PDF.js viewer with paragraph overlay, scheduler, caching, and Pro export.
- **Subtitle translation** — YouTube, Bilibili, TED, X. Driven by a central platform registry.
- **Wordbook** — save words from any surface, review with SM-2 scheduler, export to CSV / Obsidian Markdown (free tier capped at 100 words).
- **Billing / auth** — login + Pro upgrade via Paddle (USD sub) or Stripe (CNY one-time, Alipay + WeChat Pay).
- **TTS + article reading** — text-to-speech playback via the offscreen document (Chrome) with Firefox fallback.
- **Configurable prompts + AI providers** — Vercel AI SDK + 20+ provider packages.

This package lives at `apps/extension/` inside the `getu-translate` monorepo.

## Key Files

| File                 | Description                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`       | Package manifest (`@getu/extension`). Pinned to `pnpm@10.32.1`. Contains all build/test/lint scripts and all extension dependencies.                                                                                       |
| `wxt.config.ts`      | WXT framework config: src dir, manifest (permissions, MV3, browser-specific overrides), zip rules, dev server port (3333), and a Vite plugin that fails the build if unintended `WXT_*_API_KEY` env vars would be bundled. |
| `tsconfig.json`      | Extends `.wxt/tsconfig.json`. JSX = `react-jsx`. Excludes `repos`.                                                                                                                                                         |
| `vitest.config.ts`   | Vitest + WXT testing setup, jsdom-style with `node` env, excludes `**/.claude/**` and `**/repos/**`.                                                                                                                       |
| `vitest.setup.ts`    | Shared test setup.                                                                                                                                                                                                         |
| `eslint.config.mjs`  | Antfu ESLint v8 config.                                                                                                                                                                                                    |
| `components.json`    | shadcn/ui generator config.                                                                                                                                                                                                |
| `postcss.config.cjs` | PostCSS plugins (Tailwind v4, autoprefixer, rem-to-px).                                                                                                                                                                    |

## Subdirectories

| Directory  | Purpose                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`     | All extension source: entrypoints, components, utils, hooks, types, locales, in-source assets (see `src/AGENTS.md`).                           |
| `scripts/` | Build/maintenance scripts (e.g. AI-SDK provider model scraper, debug helpers) (see `scripts/AGENTS.md`).                                       |
| `public/`  | Static files copied verbatim into the extension build (see `public/AGENTS.md`).                                                                |
| `assets/`  | Repo-level marketing/store/demo assets — NOT bundled into extension (excluded by `wxt.config.ts` zip excludeSources) (see `assets/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- **Package manager is pnpm.** Always use `pnpm` commands. From monorepo root, target this package with `pnpm --filter @getu/extension <script>`.
- **Node ≥ 22** is required (`devEngines.runtime`).
- **Do not introduce new dependencies casually** — this extension already pulls 20+ AI SDK providers and is size-sensitive. Justify any new dep.
- **Manifest changes** go in `wxt.config.ts` (not in a hand-written manifest.json). Permissions need careful review.
- **Do NOT bundle secrets.** The `check-api-key-env` Vite plugin will fail production builds if any `WXT_*_API_KEY` env var (other than the allowlisted `WXT_POSTHOG_API_KEY`) is set at build time.
- **Browser-specific code paths** for Firefox MV3 live in `wxt.config.ts` (`browser_specific_settings`, CSP override). Firefox does not support `offscreen` permission; respect that branch.
- **Source root is `src/`** (set via `srcDir: "src"` in WXT config). All app code goes there.
- **Auto-imports are disabled** (`imports: false` in WXT config) — every import must be explicit. Do not rely on globals.
- **Internal packages**: `@getu/contract` and `@getu/definitions` are consumed from `packages/` via `workspace:*`.

### Testing Requirements

- Run tests with `pnpm test` (single run) / `pnpm test:watch` (watch) / `pnpm test:cov` (coverage).
- **Set `SKIP_FREE_API=true` locally** when running tests — some tests hit live translation services.
- Vitest excludes `**/.claude/**` and `**/repos/**`; do not place test fixtures there.

### Build / Lint / Test Commands

| Command                                                       | What it does                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                    | Chrome dev build with HMR                                                                     |
| `pnpm dev:edge` / `pnpm dev:firefox`                          | Same for Edge / Firefox MV3                                                                   |
| `pnpm dev:local`                                              | Dev build aliasing packages to local sibling `read-frog-monorepo/` checkout                   |
| `pnpm build` (`build:edge`, `build:firefox`, `build:analyze`) | Production builds                                                                             |
| `pnpm zip` (`zip:edge`, `zip:firefox`, `zip:all`)             | Build + zip for store submission (sets `WXT_ZIP_MODE=true`, requires Google/PostHog env vars) |
| `pnpm test`, `pnpm test:watch`, `pnpm test:cov`               | Vitest                                                                                        |
| `pnpm lint`, `pnpm lint:fix`                                  | ESLint (Antfu config)                                                                         |
| `pnpm type-check`                                             | `tsc --noEmit`                                                                                |
| `pnpm release`                                                | `changeset tag && git push origin --tags`                                                     |
| `pnpm scrape:ai-sdk-models`                                   | Refresh `scripts/output/ai-sdk-provider-models.json`                                          |

### Common Patterns

- **State**: Jotai atoms (see `src/utils/atoms/`).
- **Persistence**: Dexie/IndexedDB (`src/utils/db/dexie/`) + WXT storage.
- **Cross-context messaging**: `@webext-core/messaging` wrapped in `src/utils/message.ts`.
- **AI calls**: Vercel AI SDK (`ai` + per-provider `@ai-sdk/*` packages). See `src/utils/providers/`.
- **Server endpoints**: oRPC client in `src/utils/orpc/`, hitting backend via `@getu/contract`.
- **i18n**: `@wxt-dev/i18n` modules + `src/locales/` JSON message catalogs.
- **Styling**: Tailwind v4 + shadcn/ui. Content scripts use **Shadow DOM** isolation (`src/utils/react-shadow-host/`).
- **Validation**: Zod everywhere user/external data crosses a boundary.

## Dependencies

### Internal

- `@getu/contract` (`workspace:*`) — oRPC contract shared with backend.
- `@getu/definitions` (`workspace:*`) — Shared type/data definitions.

### External (highlights)

- **Framework**: WXT 0.20.x, React 19, Vite 8.
- **AI**: Vercel `ai` v6, 20+ `@ai-sdk/*` providers, OpenRouter, Ollama, Anthropic Claude, OpenAI, Gemini, etc.
- **State / Data**: Jotai, TanStack Query, Dexie 4, oRPC client.
- **UI**: Tailwind v4, shadcn/ui, base-ui (`@base-ui/react`), CodeMirror 6, dnd-kit, react-rnd, recharts, sonner, react-markdown.
- **Auth**: better-auth.
- **Tooling**: Antfu ESLint, Vitest, Husky, Changesets, Nx, lint-staged.

<!-- MANUAL: -->
