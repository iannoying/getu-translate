export const TRANSLATION_STATE_KEY_PREFIX = "session:translationState" as const
export const SIDEBAR_SELECTED_PROVIDERS_STORAGE_KEY = "local:getu:side-content:selected-providers" as const

export function getTranslationStateKey(tabId: number): `session:translationState.${number}` {
  return `${TRANSLATION_STATE_KEY_PREFIX}.${tabId}` as const
}
