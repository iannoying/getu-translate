import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const API_SRC = join(process.cwd(), "src")
const ALLOWED = new Set([
  "analytics/logger.ts",
  "analytics/__tests__/logger.test.ts",
  "analytics/__tests__/console-audit.test.ts",
])

describe("api console logging audit", () => {
  it("keeps console.warn/error inside the logger module only", () => {
    const violations: string[] = []
    const forbiddenConsole = new RegExp("console\\.(warn|error)")

    for (const file of listSourceFiles(API_SRC)) {
      const rel = relative(API_SRC, file)
      if (ALLOWED.has(rel)) continue

      const source = readFileSync(file, "utf8")
      const lines = source.split("\n")
      for (const [index, line] of lines.entries()) {
        if (forbiddenConsole.test(line)) {
          violations.push(`${rel}:${index + 1}:${line.trim()}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(path))
    } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      out.push(path)
    }
  }
  return out
}
