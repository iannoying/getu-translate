/**
 * Parses "trigger token" syntax at the end of an input field's text, e.g.
 * `hello //en ` → translate "hello" into English. The immersive-translate-
 * style alternative to the triple-space keyboard trigger.
 *
 * The parser is deliberately pure and dependency-free: callers pass in the
 * short-code → canonical-code map they want to honor, so this module never
 * needs to know about the extension's ISO 639-3 schema.
 */

export interface TokenTriggerConfig {
  /** Leading marker — default `//`. Must be non-empty; special regex chars OK. */
  prefix: string
  /**
   * Short-code → canonical-lang-code map. Keys are matched case-insensitively.
   * Values are returned verbatim to the caller.
   *
   * Example: `{ en: "eng", zh: "cmn", ja: "jpn" }`.
   */
  knownLangs: Record<string, string>
}

export interface TokenMatch {
  /** Original text minus the trigger suffix. */
  text: string
  /** Canonical lang code (from `knownLangs` map values). */
  toLang: string
  /** The exact trailing slice that was consumed — lets callers strip it. */
  consumedSuffix: string
}

/** Escape a literal string for embedding inside a RegExp. */
function escapeRegex(src: string): string {
  return src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Check whether `raw` ends with a valid trigger token and, if so, extract the
 * leading text + resolved lang code. Returns `null` when:
 *
 *   - the string doesn't end with `<prefix><lang>[ |\n]`
 *   - the lang short-code is not in `knownLangs`
 *   - there's nothing before the prefix (text would be empty)
 *   - the prefix is followed by a space before the short-code (e.g. `// en `)
 */
export function matchTokenTrigger(raw: string, cfg: TokenTriggerConfig): TokenMatch | null {
  if (cfg.prefix.length === 0) {
    return null
  }

  const re = new RegExp(`${escapeRegex(cfg.prefix)}([A-Za-z][A-Za-z0-9-]*)[ \\n]$`)
  const m = raw.match(re)
  if (m == null) {
    return null
  }
  const shortCode = m[1].toLowerCase()
  const canonical = lookupCaseInsensitive(cfg.knownLangs, shortCode)
  if (canonical == null) {
    return null
  }
  const consumedSuffix = m[0]
  // Text is everything before the prefix, with trailing whitespace the user
  // typed just before `//` trimmed away — nobody wants "hello " translated.
  const text = raw.slice(0, raw.length - consumedSuffix.length).replace(/\s+$/, "")
  if (text.length === 0) {
    return null
  }
  return { text, toLang: canonical, consumedSuffix }
}

function lookupCaseInsensitive(map: Record<string, string>, key: string): string | null {
  if (key in map) {
    return map[key]
  }
  for (const k of Object.keys(map)) {
    if (k.toLowerCase() === key) {
      return map[k]
    }
  }
  return null
}

/**
 * Canonical short-code → ISO 639-3 map covering the languages the extension
 * already ships in its Options UI. Callers may extend this for custom users.
 */
export const DEFAULT_TOKEN_LANGS: Record<string, string> = {
  en: "eng",
  zh: "cmn",
  ja: "jpn",
  ko: "kor",
  fr: "fra",
  de: "deu",
  es: "spa",
  it: "ita",
  pt: "por",
  ru: "rus",
  ar: "arb",
  hi: "hin",
  th: "tha",
  vi: "vie",
  id: "ind",
  tr: "tur",
  nl: "nld",
  pl: "pol",
  sv: "swe",
  cs: "ces",
}
