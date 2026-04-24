<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# app

## Purpose

Next.js 15 App Router root. Top-level `layout.tsx` + `page.tsx` handle the site shell and root redirect; `[locale]/` holds the main localized routes; `log-in/` and `guide/step-1/` are un-localized **back-compat redirectors** so older extension builds (without locale prefix) don't 404.

## Key Files

| File              | Description                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `layout.tsx`      | Root `<html>` / `<body>` with global metadata. Imports `globals.css`.                              |
| `page.tsx`        | `/` — redirects to the default locale (`/en/`).                                                    |
| `components.tsx`  | Shared client components used across root + locale routes (nav, theme, etc.).                      |
| `globals.css`     | Site-wide styles.                                                                                 |

## Subdirectories

| Directory            | Purpose                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `[locale]/`          | Localized routes (`en`, `zh-CN`, `zh-TW`). See `[locale]/AGENTS.md`.                                         |
| `log-in/`            | Top-level `/log-in` redirector — forwards to `/{locale}/log-in` while preserving `?redirect=`.               |
| `guide/step-1/`      | Top-level `/guide/step-1` redirector for older extension links.                                              |

## For AI Agents

- **Do NOT add server-only logic to `layout.tsx` or `page.tsx`** — the site is statically exported; any dynamic behaviour must be client-side or come from the api Worker.
- **Legacy redirectors must stay.** Older extension builds have the un-prefixed URL baked in; do not remove or rename them.
- All new user-facing pages go under `[locale]/` and use `localeHref()` for any internal link.

<!-- MANUAL: -->
