import { describe, expect, it } from "vitest"
import { fingerprintForSrc } from "../fingerprint"

describe("fingerprintForSrc", () => {
  it("is deterministic — same src returns the same hash", () => {
    const a = fingerprintForSrc("https://example.com/paper.pdf")
    const b = fingerprintForSrc("https://example.com/paper.pdf")
    expect(a).toBe(b)
  })

  it("returns different hashes for different srcs", () => {
    const a = fingerprintForSrc("https://example.com/a.pdf")
    const b = fingerprintForSrc("https://example.com/b.pdf")
    expect(a).not.toBe(b)
  })

  it("returns a non-empty hex string", () => {
    const hash = fingerprintForSrc("https://example.com/paper.pdf")
    expect(hash).toMatch(/^[0-9a-f]+$/)
    expect(hash.length).toBeGreaterThan(0)
  })

  it("is case-sensitive in the input (URLs are technically case-sensitive)", () => {
    const a = fingerprintForSrc("https://example.com/Paper.pdf")
    const b = fingerprintForSrc("https://example.com/paper.pdf")
    expect(a).not.toBe(b)
  })
})
