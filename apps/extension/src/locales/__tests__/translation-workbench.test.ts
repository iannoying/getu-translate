import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")
const LOCALE_FILES = ["en.yml", "zh-CN.yml"] as const

const REQUIRED_KEYS = [
  "translationWorkbench:",
  "  sidebarTitle:",
  "  textTab:",
  "  documentTab:",
  "  closeSidebar:",
  "  textTitle:",
  "  documentTitle:",
  "  documentDescription:",
  "  documentFormats:",
  "  documentFeatures:",
  "  uploadDocument:",
  "  learnMore:",
  "  pdfProTitle:",
  "  pdfProBody:",
  "  babelDocTitle:",
  "  babelDocBody:",
  "  subtitleFilesTitle:",
  "  subtitleFilesBody:",
  "  inputPlaceholder:",
  "  translate:",
  "  charLimitExceeded:",
  "  noProviders:",
  "  languages:",
  "    auto:",
  "  swapLanguages:",
  "  selectProviders:",
  "  freeProviders:",
  "  proProviders:",
  "  byokProviders:",
  "  apiProviders:",
  "  idle:",
  "  loading:",
  "  errorFallback:",
  "  quotaExhausted:",
  "  loginRequired:",
  "  upgradeRequired:",
  "  loginAction:",
  "  upgradeAction:",
  "  copyResult:",
  "  retry:",
  "  copied:",
  "  copyFailed:",
] as const

describe("translation workbench i18n copy", () => {
  it.each(LOCALE_FILES)("%s defines every translationWorkbench.* key with a non-empty value", (fileName) => {
    const path = join(LOCALES_DIR, fileName)
    const text = readFileSync(path, "utf-8")

    for (const key of REQUIRED_KEYS) {
      const re = new RegExp(`^${escapeRegExp(key)}`, "m")
      expect(re.test(text), `${fileName} is missing "${key}"`).toBe(true)
    }

    const lines = text.split("\n")
    let inWorkbench = false
    for (const line of lines) {
      if (/^translationWorkbench:\s*$/.test(line)) {
        inWorkbench = true
        continue
      }
      if (inWorkbench && /^[a-z]/i.test(line)) {
        inWorkbench = false
        continue
      }
      if (inWorkbench && /^ {2}[a-z]\w*:\s*$/i.test(line) && line.trim() !== "languages:") {
        throw new Error(`${fileName}: translationWorkbench leaf has empty value: ${line.trim()}`)
      }
      if (inWorkbench && /^ {4}[a-z]\w*:\s*$/i.test(line)) {
        throw new Error(`${fileName}: translationWorkbench leaf has empty value: ${line.trim()}`)
      }
    }
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
