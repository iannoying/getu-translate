/**
 * Migration script from v072 to v073
 * - Replaces the single `getu-pro` provider entry with one provider entry per
 *   bianxie-backed Pro model so the popup Translation Service dropdown can show
 *   model-specific AI translator choices.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

const GETU_PRO_PROVIDER_ENTRIES = [
  {
    id: "getu-pro-default",
    name: "DeepSeek-V4-Pro",
    description: "AI translations powered by your GetU Pro subscription.",
    enabled: true,
    provider: "getu-pro",
    model: {
      model: "deepseek-v4-pro",
      isCustomModel: false,
      customModel: null,
    },
  },
  {
    id: "getu-pro-qwen35-plus",
    name: "Qwen3.5-plus",
    description: "AI translations powered by your GetU Pro subscription.",
    enabled: true,
    provider: "getu-pro",
    model: {
      model: "qwen3.5-plus",
      isCustomModel: false,
      customModel: null,
    },
  },
  {
    id: "getu-pro-glm-52",
    name: "Glm-5.2",
    description: "AI translations powered by your GetU Pro subscription.",
    enabled: true,
    provider: "getu-pro",
    model: {
      model: "glm-5.1",
      isCustomModel: false,
      customModel: null,
    },
  },
  {
    id: "getu-pro-gemini-3-flash-preview",
    name: "Gemini-3-flash-preview",
    description: "AI translations powered by your GetU Pro subscription.",
    enabled: true,
    provider: "getu-pro",
    model: {
      model: "gemini-3-flash-preview",
      isCustomModel: false,
      customModel: null,
    },
  },
  {
    id: "getu-pro-gemini-31-pro",
    name: "Gemini-3.1-pro",
    description: "AI translations powered by your GetU Pro subscription.",
    enabled: true,
    provider: "getu-pro",
    model: {
      model: "gemini-3.1-pro-preview",
      isCustomModel: false,
      customModel: null,
    },
  },
  {
    id: "getu-pro-gpt-55",
    name: "Gpt-5.5",
    description: "AI translations powered by your GetU Pro subscription.",
    enabled: true,
    provider: "getu-pro",
    model: {
      model: "gpt-5.5",
      isCustomModel: false,
      customModel: null,
    },
  },
  {
    id: "getu-pro-claude-sonnet-46",
    name: "Claude-sonnet-4.6",
    description: "AI translations powered by your GetU Pro subscription.",
    enabled: true,
    provider: "getu-pro",
    model: {
      model: "claude-sonnet-4-6",
      isCustomModel: false,
      customModel: null,
    },
  },
] as const

export function migrate(oldConfig: any): any {
  const providers: any[] = Array.isArray(oldConfig?.providersConfig) ? oldConfig.providersConfig : []
  const providersWithoutGetuPro = providers.filter((p: any) => p?.provider !== "getu-pro")

  return {
    ...oldConfig,
    providersConfig: [...GETU_PRO_PROVIDER_ENTRIES, ...providersWithoutGetuPro],
  }
}
