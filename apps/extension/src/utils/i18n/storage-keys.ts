// Kept in a standalone file (instead of `utils/constants/config.ts`) so unit
// tests covering the i18n module do not drag in heavyweight project deps via
// that shared constants barrel.
export const UI_LOCALE_STORAGE_KEY = "uiLocale"
