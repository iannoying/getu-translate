import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Locale smoke-test: every locale file must define the full `billing:`
 * namespace introduced in M0 so the paywall UI renders in all supported
 * languages. We do a textual check (no yaml parser) to keep this test
 * dependency-free.
 */

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")

const REQUIRED_KEYS = [
  "billing:",
  "  tier:",
  "    free:",
  "    pro:",
  "    enterprise:",
  "  upgrade:",
  "    cta:",
  "    title:",
  "    description:",
  "    close:",
  "  quota:",
  "    outOf:",
  "    remaining:",
  "    exhausted:",
  "  expiry:",
  "    active:",
  "    expired:",
  "  account:",
  "    section:",
  "    signIn:",
  "    signInPrompt:",
  "    signOut:",
  "    managePlan:",
  "    viewUsage:",
] as const

function listLocaleFiles(): string[] {
  return readdirSync(LOCALES_DIR)
    .filter(name => name.endsWith(".yml"))
    .map(name => join(LOCALES_DIR, name))
}

describe("billing i18n copy", () => {
  const locales = listLocaleFiles()

  it("discovers at least one locale file", () => {
    expect(locales.length).toBeGreaterThan(0)
  })

  it.each(locales)("%s defines every billing.* key with a non-empty value", (path) => {
    const text = readFileSync(path, "utf-8")

    for (const key of REQUIRED_KEYS) {
      // Each key must appear at least once as the start of a line
      // (with the leading indent + key + ':').
      const re = new RegExp(`^${escape(key)}`, "m")
      expect(re.test(text), `${path} is missing "${key}"`).toBe(true)
    }

    // Leaf values (4-space-indented non-section lines) under billing
    // must not be empty — protects against "managePlan:" with nothing after.
    const lines = text.split("\n")
    let inBilling = false
    for (const line of lines) {
      if (/^billing:\s*$/.test(line)) {
        inBilling = true
        continue
      }
      if (inBilling && /^[a-z]/i.test(line)) {
        // Left the billing section (next top-level key)
        inBilling = false
        continue
      }
      if (inBilling && /^ {4}[a-z]\w*:\s*$/i.test(line)) {
        throw new Error(
          `${path}: billing leaf has empty value: ${line.trim()}`,
        )
      }
    }
  })
})

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
