import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from "./locales"

const LEGACY_PAGE_PATH_ALIASES: Record<string, string> = {
  pricing: "price",
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, "")
}

export function buildLegacyLocaleRedirectScript(targetPath: string): string {
  const target = trimSlashes(targetPath)

  return `
(function () {
  var supportedLocales = ${JSON.stringify(SUPPORTED_LOCALES)};
  var defaultLocale = ${JSON.stringify(DEFAULT_LOCALE)};
  var localeStorageKey = ${JSON.stringify(LOCALE_STORAGE_KEY)};
  var aliases = ${JSON.stringify(LEGACY_PAGE_PATH_ALIASES)};
  var targetPath = ${JSON.stringify(target)};

  function isSupportedLocale(value) {
    return supportedLocales.indexOf(value) !== -1;
  }

  function detectLocaleFromLanguages(languages) {
    for (var i = 0; i < (languages || []).length; i += 1) {
      var normalized = String(languages[i]).toLowerCase();
      if (
        normalized === "zh-tw" ||
        normalized === "zh-hk" ||
        normalized === "zh-mo" ||
        normalized.indexOf("zh-hant") === 0
      ) {
        return "zh-TW";
      }
      if (
        normalized === "zh" ||
        normalized === "zh-cn" ||
        normalized === "zh-sg" ||
        normalized.indexOf("zh-hans") === 0
      ) {
        return "zh-CN";
      }
      if (normalized.indexOf("en") === 0) {
        return "en";
      }
    }
    return defaultLocale;
  }

  function getLocale() {
    try {
      var stored = window.localStorage.getItem(localeStorageKey);
      if (isSupportedLocale(stored)) return stored;
    } catch (_) {}
    return detectLocaleFromLanguages(window.navigator.languages);
  }

  var normalizedPath = aliases[targetPath] || targetPath;
  var locale = getLocale();
  var href = "/" + locale + "/" + (normalizedPath ? normalizedPath + "/" : "") + window.location.search + window.location.hash;
  window.location.replace(href);
})();
`.trim()
}
