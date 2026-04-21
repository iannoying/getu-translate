import { z } from "zod";

//#region src/constants/app.d.ts
declare const APP_NAME = "Read Frog";
//#endregion
//#region src/constants/auth.d.ts
declare const AUTH_BASE_PATH = "/api/identity";
declare const AUTH_COOKIE_PATTERNS: readonly ["better-auth.session_token"];
//#endregion
//#region src/constants/column.d.ts
declare const COLUMN_MIN_WIDTH = 100;
declare const COLUMN_MAX_WIDTH = 500;
//#endregion
//#region src/types/languages.d.ts
declare const LANG_CODE_ISO6393_OPTIONS: readonly ["eng", "cmn", "cmn-Hant", "yue", "spa", "rus", "arb", "ben", "hin", "por", "ind", "jpn", "fra", "deu", "jav", "kor", "tel", "vie", "mar", "ita", "tam", "tur", "urd", "guj", "pol", "ukr", "kan", "mai", "mal", "pes", "mya", "swh", "sun", "ron", "pan", "bho", "amh", "hau", "fuv", "bos", "hrv", "nld", "srp", "tha", "ckb", "yor", "uzn", "zlm", "ibo", "npi", "ceb", "skr", "tgl", "hun", "azj", "sin", "koi", "ell", "ces", "mag", "run", "bel", "plt", "qug", "mad", "nya", "zyb", "pbu", "kin", "zul", "bul", "swe", "lin", "som", "hms", "hnj", "ilo", "kaz", "heb", "nob", "nno", "afr", "sqi", "asm", "eus", "bre", "cat", "cos", "cym", "dan", "div", "epo", "ekk", "fao", "fij", "fin", "fry", "gla", "gle", "glg", "grn", "hat", "haw", "hye", "ido", "ina", "isl", "kat", "khm", "kir", "lao", "lat", "lvs", "lit", "ltz", "mkd", "mlt", "mon", "mri", "nso", "oci", "ori", "orm", "prs", "san", "slk", "slv", "smo", "sna", "snd", "sot", "tah", "tat", "tgk", "tir", "ton", "tsn", "tuk", "uig", "vol", "wol", "xho", "ydd", "aka", "bam", "bis", "bod", "che", "chv", "dzo", "ewe", "kab", "lug", "oss", "ssw", "ven", "war", "nde", "nbl", "pam", "hil", "bcl", "min", "ace", "bug", "ban", "bjn", "mak", "sas", "tet", "cha", "niu", "tvl", "gil", "mah", "pau", "wls", "rar", "hif"];
declare const LANG_CODE_ISO6391_OPTIONS: readonly ["en", "zh", "zh-TW", "es", "ru", "ar", "bn", "hi", "pt", "id", "ja", "fr", "de", "jv", "ko", "te", "vi", "mr", "it", "ta", "tr", "ur", "gu", "pl", "uk", "kn", "ml", "fa", "my", "sw", "su", "ro", "pa", "am", "ha", "ff", "bs", "hr", "nl", "sr", "th", "ku", "yo", "uz", "ms", "ig", "ne", "tl", "hu", "az", "si", "el", "cs", "ny", "rw", "zu", "bg", "sv", "ln", "so", "kk", "be", "he", "nb", "nn", "af", "sq", "as", "eu", "br", "ca", "co", "cy", "da", "dv", "eo", "et", "fo", "fj", "fi", "fy", "gd", "ga", "gl", "gn", "ht", "hy", "io", "ia", "is", "ka", "km", "ky", "lo", "la", "lv", "lt", "lb", "mk", "mt", "mn", "mi", "oc", "or", "om", "sa", "sk", "sl", "sm", "sn", "sd", "st", "ty", "tt", "tg", "ti", "to", "tn", "tk", "ug", "vo", "wo", "xh", "yi", "ak", "bm", "bi", "bo", "ce", "cv", "ee", "lg", "os", "ss", "ve", "nd", "nr", "ch", "mh", "dz"];
declare const langCodeISO6393Schema: z.ZodEnum<{
  eng: "eng";
  cmn: "cmn";
  "cmn-Hant": "cmn-Hant";
  yue: "yue";
  spa: "spa";
  rus: "rus";
  arb: "arb";
  ben: "ben";
  hin: "hin";
  por: "por";
  ind: "ind";
  jpn: "jpn";
  fra: "fra";
  deu: "deu";
  jav: "jav";
  kor: "kor";
  tel: "tel";
  vie: "vie";
  mar: "mar";
  ita: "ita";
  tam: "tam";
  tur: "tur";
  urd: "urd";
  guj: "guj";
  pol: "pol";
  ukr: "ukr";
  kan: "kan";
  mai: "mai";
  mal: "mal";
  pes: "pes";
  mya: "mya";
  swh: "swh";
  sun: "sun";
  ron: "ron";
  pan: "pan";
  bho: "bho";
  amh: "amh";
  hau: "hau";
  fuv: "fuv";
  bos: "bos";
  hrv: "hrv";
  nld: "nld";
  srp: "srp";
  tha: "tha";
  ckb: "ckb";
  yor: "yor";
  uzn: "uzn";
  zlm: "zlm";
  ibo: "ibo";
  npi: "npi";
  ceb: "ceb";
  skr: "skr";
  tgl: "tgl";
  hun: "hun";
  azj: "azj";
  sin: "sin";
  koi: "koi";
  ell: "ell";
  ces: "ces";
  mag: "mag";
  run: "run";
  bel: "bel";
  plt: "plt";
  qug: "qug";
  mad: "mad";
  nya: "nya";
  zyb: "zyb";
  pbu: "pbu";
  kin: "kin";
  zul: "zul";
  bul: "bul";
  swe: "swe";
  lin: "lin";
  som: "som";
  hms: "hms";
  hnj: "hnj";
  ilo: "ilo";
  kaz: "kaz";
  heb: "heb";
  nob: "nob";
  nno: "nno";
  afr: "afr";
  sqi: "sqi";
  asm: "asm";
  eus: "eus";
  bre: "bre";
  cat: "cat";
  cos: "cos";
  cym: "cym";
  dan: "dan";
  div: "div";
  epo: "epo";
  ekk: "ekk";
  fao: "fao";
  fij: "fij";
  fin: "fin";
  fry: "fry";
  gla: "gla";
  gle: "gle";
  glg: "glg";
  grn: "grn";
  hat: "hat";
  haw: "haw";
  hye: "hye";
  ido: "ido";
  ina: "ina";
  isl: "isl";
  kat: "kat";
  khm: "khm";
  kir: "kir";
  lao: "lao";
  lat: "lat";
  lvs: "lvs";
  lit: "lit";
  ltz: "ltz";
  mkd: "mkd";
  mlt: "mlt";
  mon: "mon";
  mri: "mri";
  nso: "nso";
  oci: "oci";
  ori: "ori";
  orm: "orm";
  prs: "prs";
  san: "san";
  slk: "slk";
  slv: "slv";
  smo: "smo";
  sna: "sna";
  snd: "snd";
  sot: "sot";
  tah: "tah";
  tat: "tat";
  tgk: "tgk";
  tir: "tir";
  ton: "ton";
  tsn: "tsn";
  tuk: "tuk";
  uig: "uig";
  vol: "vol";
  wol: "wol";
  xho: "xho";
  ydd: "ydd";
  aka: "aka";
  bam: "bam";
  bis: "bis";
  bod: "bod";
  che: "che";
  chv: "chv";
  dzo: "dzo";
  ewe: "ewe";
  kab: "kab";
  lug: "lug";
  oss: "oss";
  ssw: "ssw";
  ven: "ven";
  war: "war";
  nde: "nde";
  nbl: "nbl";
  pam: "pam";
  hil: "hil";
  bcl: "bcl";
  min: "min";
  ace: "ace";
  bug: "bug";
  ban: "ban";
  bjn: "bjn";
  mak: "mak";
  sas: "sas";
  tet: "tet";
  cha: "cha";
  niu: "niu";
  tvl: "tvl";
  gil: "gil";
  mah: "mah";
  pau: "pau";
  wls: "wls";
  rar: "rar";
  hif: "hif";
}>;
declare const langCodeISO6391Schema: z.ZodEnum<{
  en: "en";
  zh: "zh";
  "zh-TW": "zh-TW";
  es: "es";
  ru: "ru";
  ar: "ar";
  bn: "bn";
  hi: "hi";
  pt: "pt";
  id: "id";
  ja: "ja";
  fr: "fr";
  de: "de";
  jv: "jv";
  ko: "ko";
  te: "te";
  vi: "vi";
  mr: "mr";
  it: "it";
  ta: "ta";
  tr: "tr";
  ur: "ur";
  gu: "gu";
  pl: "pl";
  uk: "uk";
  kn: "kn";
  ml: "ml";
  fa: "fa";
  my: "my";
  sw: "sw";
  su: "su";
  ro: "ro";
  pa: "pa";
  am: "am";
  ha: "ha";
  ff: "ff";
  bs: "bs";
  hr: "hr";
  nl: "nl";
  sr: "sr";
  th: "th";
  ku: "ku";
  yo: "yo";
  uz: "uz";
  ms: "ms";
  ig: "ig";
  ne: "ne";
  tl: "tl";
  hu: "hu";
  az: "az";
  si: "si";
  el: "el";
  cs: "cs";
  ny: "ny";
  rw: "rw";
  zu: "zu";
  bg: "bg";
  sv: "sv";
  ln: "ln";
  so: "so";
  kk: "kk";
  be: "be";
  he: "he";
  nb: "nb";
  nn: "nn";
  af: "af";
  sq: "sq";
  as: "as";
  eu: "eu";
  br: "br";
  ca: "ca";
  co: "co";
  cy: "cy";
  da: "da";
  dv: "dv";
  eo: "eo";
  et: "et";
  fo: "fo";
  fj: "fj";
  fi: "fi";
  fy: "fy";
  gd: "gd";
  ga: "ga";
  gl: "gl";
  gn: "gn";
  ht: "ht";
  hy: "hy";
  io: "io";
  ia: "ia";
  is: "is";
  ka: "ka";
  km: "km";
  ky: "ky";
  lo: "lo";
  la: "la";
  lv: "lv";
  lt: "lt";
  lb: "lb";
  mk: "mk";
  mt: "mt";
  mn: "mn";
  mi: "mi";
  oc: "oc";
  or: "or";
  om: "om";
  sa: "sa";
  sk: "sk";
  sl: "sl";
  sm: "sm";
  sn: "sn";
  sd: "sd";
  st: "st";
  ty: "ty";
  tt: "tt";
  tg: "tg";
  ti: "ti";
  to: "to";
  tn: "tn";
  tk: "tk";
  ug: "ug";
  vo: "vo";
  wo: "wo";
  xh: "xh";
  yi: "yi";
  ak: "ak";
  bm: "bm";
  bi: "bi";
  bo: "bo";
  ce: "ce";
  cv: "cv";
  ee: "ee";
  lg: "lg";
  os: "os";
  ss: "ss";
  ve: "ve";
  nd: "nd";
  nr: "nr";
  ch: "ch";
  mh: "mh";
  dz: "dz";
}>;
type LangCodeISO6391 = z.infer<typeof langCodeISO6391Schema>;
type LangCodeISO6393 = z.infer<typeof langCodeISO6393Schema>;
declare const LANG_CODE_TO_EN_NAME: Record<LangCodeISO6393, string>;
declare const LANG_CODE_TO_LOCALE_NAME: Record<LangCodeISO6393, string>;
declare const ISO6393_TO_6391: Record<LangCodeISO6393, LangCodeISO6391 | undefined>;
declare const LOCALE_TO_ISO6393: Partial<Record<LangCodeISO6391, LangCodeISO6393>>;
declare const langLevel: z.ZodEnum<{
  beginner: "beginner";
  intermediate: "intermediate";
  advanced: "advanced";
}>;
type LangLevel = z.infer<typeof langLevel>;
declare const RTL_LANG_CODES: readonly LangCodeISO6393[];
//#endregion
//#region src/constants/dictionary.d.ts
/**
 * This file is used to assemble a system prompt according to different languages.
 */
interface DictionaryFieldLabels {
  pronunciation: string;
  partOfSpeech: string;
  definition: string;
  exampleSentence: string;
  extendedVocabulary: string;
  synonyms: string;
  antonyms: string;
  root: string;
  grammarPoint: string;
  explanation: string;
  uniqueAttributes: string;
}
declare const LANG_DICTIONARY_LABELS: Record<LangCodeISO6393, DictionaryFieldLabels>;
//#endregion
//#region src/constants/url.d.ts
declare const CHROME_EXTENSION_ORIGIN = "chrome-extension://modkelfkcfjpgbfmnbnllalkiogfofhb";
declare const EDGE_EXTENSION_ORIGIN = "extension://cbcbomlgikfbdnoaohcjfledcoklcjbo";
declare const TRUSTED_ORIGINS: string[];
declare const WEBSITE_DEV_PORT = 8888;
declare const WEBSITE_DEV_URL = "http://localhost:8888";
declare const CADDY_DEV_PORT = 4433;
declare const WEBSITE_CADDY_DEV_URL = "https://localhost:4433";
declare const WEBSITE_PROD_URL = "https://getutranslate.com";
declare const READFROG_DOMAIN = "getutranslate.com";
declare const LOCALHOST_DOMAIN = "localhost";
declare const AUTH_DOMAINS: readonly ["getutranslate.com", "localhost"];
//#endregion
//#region src/types/column.d.ts
declare const COLUMN_TYPES: readonly ["string", "number", "boolean", "date", "select"];
type ColumnType = (typeof COLUMN_TYPES)[number];
declare const selectOptionSchema: z.ZodObject<{
  id: z.ZodString;
  value: z.ZodString;
  color: z.ZodString;
}, z.core.$strip>;
declare const columnConfigSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  type: z.ZodLiteral<"string">;
}, z.core.$strip>, z.ZodObject<{
  type: z.ZodLiteral<"number">;
  decimal: z.ZodDefault<z.ZodNumber>;
  format: z.ZodDefault<z.ZodEnum<{
    number: "number";
    currency: "currency";
    percent: "percent";
  }>>;
}, z.core.$strip>, z.ZodObject<{
  type: z.ZodLiteral<"boolean">;
}, z.core.$strip>, z.ZodObject<{
  type: z.ZodLiteral<"date">;
  dateFormat: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  type: z.ZodLiteral<"select">;
  options: z.ZodDefault<z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    value: z.ZodString;
    color: z.ZodString;
  }, z.core.$strip>>>;
}, z.core.$strip>], "type">;
type ColumnConfig = z.infer<typeof columnConfigSchema>;
type SelectOption = z.infer<typeof selectOptionSchema>;
declare const COLUMN_TYPE_INFO: Record<ColumnType, {
  label: string;
  defaultConfig: ColumnConfig;
}>;
declare function isNumberConfig(config: ColumnConfig): config is Extract<ColumnConfig, {
  type: 'number';
}>;
declare function isSelectConfig(config: ColumnConfig): config is Extract<ColumnConfig, {
  type: 'select';
}>;
//#endregion
//#region src/schemas/cell-value.d.ts
/**
 * Create a Zod schema for a cell value based on column config.
 * All cell schemas are nullable (empty cells are valid).
 */
declare function createCellSchema(config: ColumnConfig): z.ZodType;
/**
 * Create a Zod schema for an entire row based on column definitions.
 * Each column becomes a field in the object schema.
 */
declare function createRowSchema(columns: Array<{
  id: string;
  name: string;
  config: ColumnConfig;
}>): z.ZodObject<Record<string, z.ZodType>>;
/**
 * Convert row schema to JSON Schema for AI structured outputs.
 * Use this when generating prompts for LLMs that support structured outputs.
 */
declare function rowSchemaToJsonSchema(columns: Array<{
  id: string;
  name: string;
  config: ColumnConfig;
}>): z.core.ZodStandardJSONSchemaPayload<z.ZodObject<Record<string, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>, z.core.$strip>>;
//#endregion
//#region src/schemas/version.d.ts
/**
 * Semantic version regex pattern
 * Matches versions like: 1.0.0, 10.20.30
 * Does NOT match: v1.0.0, 1.0.0-alpha, 1.0, 1.-1.0
 */
declare const SEMANTIC_VERSION_REGEX: RegExp;
/**
 * Zod schema for semantic version validation
 * Validates semantic version strings according to SemVer conventions
 * Requires exactly 3 parts: major.minor.patch
 *
 * @example
 * semanticVersionSchema.parse('1.0.0') // ✓ valid
 * semanticVersionSchema.parse('10.20.30') // ✓ valid
 * semanticVersionSchema.parse('1.11') // ✗ throws error (must have 3 parts)
 * semanticVersionSchema.parse('v1.0.0') // ✗ throws error
 * semanticVersionSchema.parse('1.0.0-alpha') // ✗ throws error
 */
declare const semanticVersionSchema: z.ZodString;
/**
 * Type for semantic version string
 */
type SemanticVersion = z.infer<typeof semanticVersionSchema>;
/**
 * Version type classification
 */
type VersionType = 'major' | 'minor' | 'patch';
/**
 * Parse a semantic version string into its components
 * Validates the input using semanticVersionSchema before parsing
 *
 * @param version - The version string to parse (must be in format major.minor.patch)
 * @returns An object containing the major, minor, and patch numbers
 * @throws {z.ZodError} If the version string is invalid
 *
 * @example
 * parseSemanticVersion('1.2.3') // { major: 1, minor: 2, patch: 3 }
 * parseSemanticVersion('10.20.30') // { major: 10, minor: 20, patch: 30 }
 * parseSemanticVersion('1.0') // throws error - must have 3 parts
 * parseSemanticVersion('v1.0.0') // throws error - invalid format
 */
declare function parseSemanticVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
};
/**
 * Determine the version type (major, minor, or patch) based on semantic versioning rules
 * Validates the input using semanticVersionSchema before classification
 *
 * @param version - The version string to classify
 * @returns The version type classification
 * @throws {z.ZodError} If the version string is invalid
 *
 * @example
 * getVersionType('1.0.0') // 'major'
 * getVersionType('1.2.0') // 'minor'
 * getVersionType('1.2.3') // 'patch'
 * getVersionType('1.0') // throws error - must have 3 parts
 */
declare function getVersionType(version: string): VersionType;
//#endregion
export { APP_NAME, AUTH_BASE_PATH, AUTH_COOKIE_PATTERNS, AUTH_DOMAINS, CADDY_DEV_PORT, CHROME_EXTENSION_ORIGIN, COLUMN_MAX_WIDTH, COLUMN_MIN_WIDTH, COLUMN_TYPES, COLUMN_TYPE_INFO, ColumnConfig, ColumnType, DictionaryFieldLabels, EDGE_EXTENSION_ORIGIN, ISO6393_TO_6391, LANG_CODE_ISO6391_OPTIONS, LANG_CODE_ISO6393_OPTIONS, LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_DICTIONARY_LABELS, LOCALE_TO_ISO6393, LOCALHOST_DOMAIN, LangCodeISO6391, LangCodeISO6393, LangLevel, READFROG_DOMAIN, RTL_LANG_CODES, SEMANTIC_VERSION_REGEX, SelectOption, SemanticVersion, TRUSTED_ORIGINS, VersionType, WEBSITE_CADDY_DEV_URL, WEBSITE_DEV_PORT, WEBSITE_DEV_URL, WEBSITE_PROD_URL, columnConfigSchema, createCellSchema, createRowSchema, getVersionType, isNumberConfig, isSelectConfig, langCodeISO6391Schema, langCodeISO6393Schema, langLevel, parseSemanticVersion, rowSchemaToJsonSchema, selectOptionSchema, semanticVersionSchema };
//# sourceMappingURL=index.d.ts.map