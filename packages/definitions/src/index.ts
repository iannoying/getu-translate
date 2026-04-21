// Re-export everything from the upstream source, overriding URL/domain constants for GetU Translate.
export {
  APP_NAME,
  AUTH_BASE_PATH,
  AUTH_COOKIE_PATTERNS,
  CADDY_DEV_PORT,
  CHROME_EXTENSION_ORIGIN,
  COLUMN_MAX_WIDTH,
  COLUMN_MIN_WIDTH,
  COLUMN_TYPES,
  COLUMN_TYPE_INFO,
  EDGE_EXTENSION_ORIGIN,
  ISO6393_TO_6391,
  LANG_CODE_ISO6391_OPTIONS,
  LANG_CODE_ISO6393_OPTIONS,
  LANG_CODE_TO_EN_NAME,
  LANG_CODE_TO_LOCALE_NAME,
  LANG_DICTIONARY_LABELS,
  LOCALE_TO_ISO6393,
  LOCALHOST_DOMAIN,
  RTL_LANG_CODES,
  SEMANTIC_VERSION_REGEX,
  TRUSTED_ORIGINS,
  WEBSITE_DEV_PORT,
  WEBSITE_DEV_URL,
  columnConfigSchema,
  createCellSchema,
  createRowSchema,
  getVersionType,
  isNumberConfig,
  isSelectConfig,
  langCodeISO6391Schema,
  langCodeISO6393Schema,
  langLevel,
  parseSemanticVersion,
  rowSchemaToJsonSchema,
  selectOptionSchema,
  semanticVersionSchema,
} from "./base.js"

export type {
  ColumnConfig,
  ColumnType,
  DictionaryFieldLabels,
  LangCodeISO6391,
  LangCodeISO6393,
  LangLevel,
  SemanticVersion,
  SelectOption,
  VersionType,
} from "./base.js"

// GetU Translate rebranded URL/domain constants (override upstream values)
export const GETU_DOMAIN = "getutranslate.com"
export const WEBSITE_PROD_URL = "https://getutranslate.com"
export const WEBSITE_CADDY_DEV_URL = "http://localhost:8788"
export const AUTH_DOMAINS = ["getutranslate.com", "localhost"] as const
