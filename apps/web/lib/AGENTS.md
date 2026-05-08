<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-08 -->

# lib

## Purpose

App-level helpers shared across the App Router pages. Four concerns: the better-auth client, the oRPC client (pointed at the api Worker), the analytics dispatcher, and the i18n runtime (locales, messages, URL routing).

## Key Files

| File             | Description                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth-client.ts` | `createAuthClient(...)` from better-auth — session queries, social OAuth, email OTP, passkey from the browser.                                                                                                                                                                                                            |
| `orpc-client.ts` | Typed oRPC client against `@getu/contract` routed to `NEXT_PUBLIC_API_BASE_URL`. Sends credentials for cookie auth.                                                                                                                                                                                                       |
| `analytics.ts`   | `track(event, properties?)` — fire-and-forget oRPC `analytics.track` dispatch. Whitelist-typed `AnalyticsEvent` (`text_translate_completed`, `pdf_uploaded`, `pdf_completed`, `pro_upgrade_triggered`). Anonymous users (oRPC `UNAUTHORIZED`) are silently no-op'd; other failures `console.warn`. UX never blocks on analytics. |

## Subdirectories

| Directory | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `i18n/`   | Locale list, routing helpers, message catalogue (see `i18n/AGENTS.md`). |
| `__tests__/` | Vitest specs for `analytics.ts` (anon suppression) and helper modules. |

## For AI Agents

- Both clients are **browser-only**. Importing them into a server component will break the static export.
- The API base URL is baked via `NEXT_PUBLIC_API_BASE_URL` at build time. Dev (unset) defaults to localhost; `pages:deploy` pins prod.
- Better-auth + oRPC both need `credentials: "include"` — do not change the fetch options without also updating api CORS allowlist.
- **Analytics is best-effort.** Always call `track(...)` without `await`; the function already handles errors. Do not add error UX around it.
- When adding a new analytics event, extend the `AnalyticsEvent` union here AND `events.ts` + `analyticsTrackInputSchema` in `@getu/contract` — they must stay aligned (the contract schema is the wire-level enum).

<!-- MANUAL: -->
