import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")
const LOCALE_FILES = ["en.yml", "zh-CN.yml", "zh-TW.yml", "ja.yml", "ko.yml", "ru.yml", "tr.yml", "vi.yml"] as const

const REQUIRED_KEYS = [
  "sidebarTitle",
  "textTab",
  "documentTab",
  "closeSidebar",
  "openPanel",
  "textTitle",
  "documentTitle",
  "documentDescription",
  "documentFormats",
  "documentFeatures",
  "uploadDocument",
  "learnMore",
  "pdfProTitle",
  "pdfProBody",
  "babelDocTitle",
  "babelDocBody",
  "subtitleFilesTitle",
  "subtitleFilesBody",
  "inputPlaceholder",
  "translate",
  "charLimitExceeded",
  "noProviders",
  "languages.auto",
  "swapLanguages",
  "selectProviders",
  "freeProviders",
  "proProviders",
  "byokProviders",
  "apiProviders",
  "idle",
  "loading",
  "errorFallback",
  "quotaExhausted",
  "loginRequired",
  "upgradeRequired",
  "loginAction",
  "upgradeAction",
  "copyResult",
  "retry",
  "copied",
  "copyFailed",
] as const

describe("translation workbench i18n copy", () => {
  it("tracks the floating-button open-panel label", () => {
    expect(REQUIRED_KEYS).toContain("openPanel")
  })

  it.each(LOCALE_FILES)("%s defines every translationWorkbench.* key with a non-empty value", (fileName) => {
    const path = join(LOCALES_DIR, fileName)
    const text = readFileSync(path, "utf-8")
    const subtree = parseTranslationWorkbenchSubtree(text)

    for (const key of REQUIRED_KEYS) {
      const value = subtree.get(key)
      expect(value, `${fileName} is missing translationWorkbench.${key}`).toBeDefined()
      expect(value?.trim(), `${fileName} has empty translationWorkbench.${key}`).not.toBe("")
    }
  })
})

function parseTranslationWorkbenchSubtree(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => line === "translationWorkbench:")
  if (start === -1)
    return new Map()

  const subtree = new Map<string, string>()
  let parent: string | null = null

  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line))
      break
    if (line.trim() === "" || line.trimStart().startsWith("#"))
      continue

    if (line.startsWith("  ") && !line.startsWith("    ")) {
      const separatorIndex = line.indexOf(":")
      if (separatorIndex === -1)
        continue

      const key = line.slice(2, separatorIndex)
      const value = line.slice(separatorIndex + 1).trim()
      if (value === "") {
        parent = key
      }
      else {
        parent = null
        subtree.set(key, value)
      }
      continue
    }

    if (line.startsWith("    ") && parent !== null) {
      const separatorIndex = line.indexOf(":")
      if (separatorIndex === -1)
        continue

      const key = line.slice(4, separatorIndex)
      const value = line.slice(separatorIndex + 1).trim()
      subtree.set(`${parent}.${key}`, value)
    }
  }

  return subtree
}
