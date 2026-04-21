<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# providers

## Purpose

Bridges Read Frog's provider configuration (saved in `Config.providersConfig`) to concrete Vercel AI SDK `LanguageModel` instances. Owns the central `CREATE_AI_MAPPER` lookup that wires every supported provider key (OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Bedrock, Ollama, OpenAI-compatible aggregators, etc.) to its `@ai-sdk/<provider>` factory, resolves the active model id (custom vs. picker-selected), and computes recommended `providerOptions` (e.g. reasoning effort, verbosity) per model pattern.

## Key Files

| File          | Description                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.ts`    | `getModelById(providerId)` — loads `Config` from `local:CONFIG_STORAGE_KEY`, finds the `LLMProviderConfig` by id, calls the matching factory in `CREATE_AI_MAPPER` with `apiKey`/`baseURL`/`connectionOptions`/custom headers (e.g. Anthropic browser-access flag), then returns `provider.languageModel(modelId)`.        |
| `model-id.ts` | `resolveModelId(providerModel)` — picks `providerModel.customModel` when `isCustomModel`, otherwise the picker-selected `providerModel.model`, trimmed.                                                                                                                                                                    |
| `options.ts`  | `getRecommendedProviderOptionsMatch` / `getProviderOptions` / `getProviderOptionsWithOverride` — first-match scan of `LLM_MODEL_OPTIONS` patterns, plus `OPENAI_COMPATIBLE_OPTION_ALIASES` that normalizes raw `reasoning_effort`/`verbosity` keys into `reasoningEffort`/`textVerbosity` for OpenAI-compatible providers. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- `CREATE_AI_MAPPER` in `model.ts` is the single registry of supported providers. Adding a new provider means (a) extending `LLMProviderType` in `@/types/config/provider`, (b) adding the `@ai-sdk/<provider>` import + entry here, and (c) registering picker model lists in `@/utils/constants/models` (which is what feeds the model dropdown).
- This module ultimately consumes `scripts/output/ai-sdk-provider-models.json` indirectly: the Vercel-AI-SDK model lists in `@/utils/constants/models` are sync'd from that JSON via `update-ai-sdk-models` workflow. Don't hand-edit those lists; rerun the sync.
- "Custom" providers go through `isCustomLLMProvider()` and pass `supportsStructuredOutputs: true` plus a `name` to `createOpenAICompatible`. Keep that branch — many self-hosted/aggregator providers depend on it.
- Pattern matching in `options.ts` is FIRST-MATCH-WINS. More specific patterns (e.g. exact model ids) must be added before broader regexes in `LLM_MODEL_OPTIONS`.
- `getProviderOptionsWithOverride` distinguishes "user explicitly set `{}`" from "user didn't configure" — preserve the `userOptions !== undefined` check; it's load-bearing for letting users opt out of reasoning by setting an empty object.
- Custom headers belong in `CUSTOM_HEADER_MAP` in `model.ts` (e.g. Anthropic's `anthropic-dangerous-direct-browser-access: true`). Never inline them at call sites.

### Testing Requirements

- Vitest with co-located `__tests__/`. Tests cover model id resolution, OpenAI-compatible alias normalization, and pattern-matching priority for `LLM_MODEL_OPTIONS`.
- No `SKIP_FREE_API` — these tests don't hit live AI endpoints; they verify pure resolution logic.

### Common Patterns

- Async config read on every call (`getModelById`) — there's no in-memory cache; freshness wins over micro-optimization. Don't add a cache without invalidation tied to config writes.
- `compactObject(connectionOptions)` strips empty values before spreading into the factory call so `undefined`/`""` don't override SDK defaults.
- Provider type guards (`isCustomLLMProvider`, `isAPIProviderConfig`) come from `@/types/config/provider`; reuse them, don't duplicate `provider === 'openai'` checks.

## Dependencies

### Internal

- `@/types/config/config` (`Config`), `@/types/config/provider` (type guards, `CUSTOM_LLM_PROVIDER_TYPES`)
- `@/types/utils` (`compactObject`)
- `@/utils/config/helpers` (`getLLMProvidersConfig`, `getProviderConfigById`)
- `@/utils/constants/config` (`CONFIG_STORAGE_KEY`)
- `@/utils/constants/models` (`LLM_MODEL_OPTIONS`)

### External

- `#imports` from WXT — `storage`
- Vercel AI SDK provider packages: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek`, `@ai-sdk/openai-compatible`, `@ai-sdk/xai`, `@ai-sdk/amazon-bedrock`, `@ai-sdk/groq`, `@ai-sdk/deepinfra`, `@ai-sdk/mistral`, `@ai-sdk/togetherai`, `@ai-sdk/cohere`, `@ai-sdk/fireworks`, `@ai-sdk/cerebras`, `@ai-sdk/replicate`, `@ai-sdk/perplexity`, `@ai-sdk/vercel`, `@ai-sdk/alibaba`, `@ai-sdk/moonshotai`, `@ai-sdk/huggingface`
- Third-party providers: `@openrouter/ai-sdk-provider`, `ollama-ai-provider-v2`, `vercel-minimax-ai-provider`
- `ai` — `JSONValue` type used in provider-options shape

<!-- MANUAL: -->
