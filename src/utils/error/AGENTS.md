<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# error

## Purpose

Best-effort error message extraction for user-facing toasts and logs. Handles the messy reality of upstream LLM/API errors — JSON-string bodies, `{ error: { message } }`, `{ message }`, plain text — and AI SDK errors that carry their detail on `responseBody` or `text` instead of `message`.

## Key Files

| File                 | Description                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract-message.ts` | `extractErrorMessage(Response)` — awaits `response.text()` and JSON.parses it, walking `json.error.message` → `json.message` → first 100 chars of body, falling back to `${status} ${statusText}`. `extractAISDKErrorMessage(unknown)` — picks the first non-empty string from `error.message` / `error.responseBody` / `error.text`, defaulting to `"Unexpected error occurred"`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **`extractErrorMessage` consumes the body** — the caller cannot read `response.json()`/`response.text()` again. Pass a clone if both error parsing and body access are needed.
- The 100-char slice on the text-body fallback prevents dumping a giant HTML 500 page into a toast. Do not raise it without a UI plan.
- `extractAISDKErrorMessage` exists because Vercel AI SDK errors often have a useless `message: "AI_APICallError"` while the real reason is in `responseBody`. Always use this helper when surfacing AI SDK errors.
- Both helpers are intentionally pure (no logging, no toast). Compose them at the call site with `logger.error` / `toast.error`.

### Testing Requirements

- No co-located tests today. When adding cases, fixture both string and object error bodies — the JSON string branch (`typeof json === "string"`) is the easiest to forget.

### Common Patterns

- "Try-each-shape with non-empty fallback" — `getNonEmptyString` keeps the chain readable; reuse this style for any other format-juggling helper.

## Dependencies

### Internal

None — leaf module.

### External

None — pure standard JS.

<!-- MANUAL: -->
