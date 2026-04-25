# GetU Pro AI Translator Model Choices

Date: 2026-04-25
Status: Implemented

## Goal

In the extension popup, the Translation Service dropdown currently groups LLM-backed providers under "AI Translator". The GetU Pro entry should become model-specific choices:

| User-facing name | bianxie request model |
| --- | --- |
| DeepSeek-V4-Pro | `deepseek-v4-pro` |
| Qwen3.5-plus | `qwen3.5-plus` |
| Glm-5.2 | `glm-5.1` |
| Gemini-3-flash | `gemini-3-flash-preview` |
| Gemini-3.1-pro | `gemini-3.1-pro-preview` |
| GPT-5.5 | `gpt-5.5` |
| Claude-sonnet-4.6 | `claude-sonnet-4-6` |

The display name is what users see in the popup. The request model is what the extension sends through the GetU Pro OpenAI-compatible provider path to the backend AI proxy, which forwards to bianxie.

## Current Implementation

The popup does not render a separate model picker inside Translation Service. It renders `ProviderConfig.name` through `ProviderSelector`, grouped by provider type. The existing GetU Pro implementation is a virtual LLM provider:

- Extension default provider config: `apps/extension/src/utils/constants/providers.ts`
- GetU Pro model list: `LLM_PROVIDER_MODELS["getu-pro"]`, sourced from `@getu/contract` `PRO_MODEL_WHITELIST`
- Extension model resolution: `apps/extension/src/utils/providers/model.ts`
- Backend whitelist and quota normalization: `packages/contract/src/ai-models.ts`
- Backend proxy validation and forwarding: `apps/api/src/ai/proxy.ts`

## Recommended Approach

Use multiple `getu-pro` provider configs instead of changing the popup component. Each config has a unique internal id, the requested display name as `name`, and the bianxie model id in `model.model`.

This keeps the UI architecture unchanged and uses the existing data flow:

1. Popup displays `provider.name`.
2. User selection stores `provider.id`.
3. `getModelById()` resolves that id to a `getu-pro` provider config.
4. `resolveModelId()` returns `model.model`.
5. Backend validates the model against `PRO_MODEL_WHITELIST` and forwards it to bianxie.

The first entry should keep id `getu-pro-default` so existing feature references remain valid after migration.

## Alternatives Considered

1. Add a model sub-picker to the popup.
   This is heavier and changes a compact 320px UI. It also duplicates behavior already available through provider configs.

2. Rename the single GetU Pro provider and keep only one model.
   This does not satisfy the requirement because users need seven selectable choices.

3. Add seven separate provider types.
   This would touch provider type unions, icons, schema, and provider factory routing unnecessarily. The behavior is one virtual provider with multiple model presets.

## Implementation Plan

1. Update `packages/contract/src/ai-models.ts` so `PRO_MODEL_WHITELIST` contains the seven bianxie model ids.
2. Update extension default GetU Pro provider configs to expose seven `getu-pro` entries with the requested display names.
3. Bump `CONFIG_SCHEMA_VERSION` and add frozen migrations after the current mainline schema: `v072-to-v073` replaces existing `getu-pro` entries with the new list while keeping `getu-pro-default` as the first id, `v073-to-v074` normalizes the GPT display label, and `v074-to-v075` shortens the Gemini 3 Flash display label.
4. Add migration tests for ordering, mapping, id preservation, and idempotency.
5. Update API proxy tests to use a current whitelisted model.
6. Add or update config examples through `v075.ts` so the all-migrations suite can validate the new latest schema.
7. In the popup Translation Service selector, show only GetU Pro LLM entries under "AI Translator" while leaving user-configured API providers available elsewhere.

## Validation

Run targeted tests first:

```sh
SKIP_FREE_API=true pnpm --filter @getu/extension test -- config
pnpm --filter @getu/api test -- ai
pnpm --filter @getu/contract test
```

Then run:

```sh
SKIP_FREE_API=true pnpm test
```

If type inference around the generated GetU Pro provider list is too loose, replace the mapped construction with an explicit typed tuple.
