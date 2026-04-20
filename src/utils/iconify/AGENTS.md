<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# iconify

## Purpose

One-line shim that redirects `@iconify/react`'s remote icon-fetch through the extension background. Without this, host-page CSP can block the direct request iconify makes for icons it does not have inlined, and many sites' CSPs explicitly disallow `api.iconify.design`. By calling `_api.setFetch(...)`, every icon Read Frog renders inside a Shadow DOM uses `backgroundFetch` instead.

## Key Files

| File                        | Description                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setup-background-fetch.ts` | `ensureIconifyBackgroundFetch()` — idempotent guard that calls `_api.setFetch(iconifyBackgroundFetch)` once per page; the inner fetch always uses `credentials: "omit"` (icon CDN is anonymous). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Call `ensureIconifyBackgroundFetch()` exactly once per content-script context**, ideally as the first side-effect in any entrypoint that renders `<Icon icon="…" />`. The internal `isConfigured` flag makes repeated calls cheap.
- This must run **before** the first `<Icon>` mount; iconify caches per-icon-name internally and re-uses the fetcher captured at first-fetch time.
- `_api` is intentionally a private import from `@iconify/react` — if the package ever ships an official `setFetch`, switch to that and update tests.
- Do not attach credentials — icon endpoints are anonymous and forwarding cookies just bloats the proxy round-trip.

### Testing Requirements

- Tests live in `iconify/__tests__/`. Reset the module between cases (Vitest `vi.resetModules()`) so the `isConfigured` flag does not leak.

### Common Patterns

- "Patch a third-party global once at boot" — same shape as `zod-config.ts`'s `z.config({ jitless: true })`.

## Dependencies

### Internal

- `@/utils/content-script/background-fetch-client` — `backgroundFetch`.

### External

- `@iconify/react` — uses the private `_api.setFetch`. Pin the version carefully; an internal rename here would break silently.

<!-- MANUAL: -->
