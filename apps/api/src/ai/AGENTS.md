<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# ai

## Purpose

OpenAI-compatible AI proxy for Pro users. The extension exchanges a session cookie for a short-lived JWT at `/ai/v1/token`, then uses that JWT to call `/ai/v1/chat/completions` — the worker forwards to the underlying LLM provider, enforces rate limits, and records usage for quota accounting.

## Key Files

| File                | Description                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `jwt.ts`            | `signAiJwt({ userId }, secret)` + `verifyAiJwt`. Short TTL (`AI_JWT_TTL_SECONDS`). HS256 via Web Crypto.              |
| `proxy.ts`          | `handleChatCompletions(request, env, ctx)` — JWT check, rate-limit check, fetch upstream, stream SSE back, count usage. |
| `rate-limit.ts`     | KV-backed token-bucket / sliding-window rate limiter keyed by user id.                                              |
| `usage-parser.ts`   | Extracts input/output token counts from a chat-completions response (streaming + non-streaming).                    |
| `__tests__/*.test.ts` | Unit tests for each module. Streaming paths use a mocked `fetch`.                                                  |

## For AI Agents

### Working In This Directory

- **Never log the JWT or raw request body.** Log only derived fields (user id, model name, token counts).
- Rate-limit before forwarding — failing after spending the upstream call wastes money.
- Usage parsing must handle both SSE streams (`data: {...}` events) and JSON bodies; keep both tested.
- If adding a new upstream provider, keep the OpenAI chat-completions shape on the edge — clients already depend on it.

### Testing Requirements

- Every file has a matching `__tests__/*.test.ts`. Do not merge changes without test updates.
- Use `vi.fn()` / `vi.stubGlobal("fetch", ...)` to mock upstream. Never hit the real provider.

## Dependencies

### External

- Web Crypto (`crypto.subtle`) — JWT sign/verify, no `jsonwebtoken` dep.
- Cloudflare KV binding — rate-limit state.

<!-- MANUAL: -->
