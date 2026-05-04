/**
 * AuthGate unit test — pure function level, no React/RTL needed.
 *
 * The gating logic reduces to three cases: loading, unauthed, authed.
 * We extract and test the decision table directly.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

type SessionState = { isPending: boolean; data: { user: object } | null }

/** Mirrors the gating logic inside AuthGate */
function resolveGateState(session: SessionState): "loading" | "prompt" | "show" {
  if (session.isPending) return "loading"
  if (!session.data?.user) return "prompt"
  return "show"
}

describe("AuthGate state resolution", () => {
  it("returns 'loading' while session is pending", () => {
    expect(resolveGateState({ isPending: true, data: null })).toBe("loading")
  })

  it("returns 'prompt' when session resolved with no user", () => {
    expect(resolveGateState({ isPending: false, data: null })).toBe("prompt")
  })

  it("returns 'show' when session resolved with a user", () => {
    expect(resolveGateState({ isPending: false, data: { user: { id: "u1" } } })).toBe("show")
  })

  it("returns 'loading' even if data is present while pending (race guard)", () => {
    // isPending takes priority
    expect(resolveGateState({ isPending: true, data: { user: { id: "u1" } } })).toBe("loading")
  })
})

describe("AuthGate MDX usage", () => {
  it("requires every MDX AuthGate opening tag to pass fallback", () => {
    const missingFallback: string[] = []

    for (const file of listMdxFiles(join(process.cwd(), "app"))) {
      const source = readFileSync(file, "utf8")
      const matches = source.matchAll(/<AuthGate\b[^>]*>/g)

      for (const match of matches) {
        if (!match[0].includes("fallback=")) {
          missingFallback.push(
            `${file.replace(`${process.cwd()}/`, "")}:${lineNumber(source, match.index ?? 0)}`,
          )
        }
      }
    }

    expect(missingFallback).toEqual([])
  })
})

function listMdxFiles(dir: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      files.push(...listMdxFiles(path))
    } else if (path.endsWith(".mdx")) {
      files.push(path)
    }
  }

  return files
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}
