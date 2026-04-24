<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# lib

## Purpose

App-level helpers shared across the App Router pages. Three concerns: the better-auth client, the oRPC client (pointed at the api Worker), and the i18n runtime (locales, messages, URL routing).

## Key Files

| File               | Description                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `auth-client.ts`   | `createAuthClient(...)` from better-auth — session queries, social OAuth, email OTP, passkey from the browser. |
| `orpc-client.ts`   | Typed oRPC client against `@getu/contract` routed to `NEXT_PUBLIC_API_BASE_URL`. Sends credentials for cookie auth. |

## Subdirectories

| Directory  | Purpose                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `i18n/`    | Locale list, routing helpers, message catalogue (see `i18n/AGENTS.md`).                                         |

## For AI Agents

- Both clients are **browser-only**. Importing them into a server component will break the static export.
- The API base URL is baked via `NEXT_PUBLIC_API_BASE_URL` at build time. Dev (unset) defaults to localhost; `pages:deploy` pins prod.
- Better-auth + oRPC both need `credentials: "include"` — do not change the fetch options without also updating api CORS allowlist.

<!-- MANUAL: -->
