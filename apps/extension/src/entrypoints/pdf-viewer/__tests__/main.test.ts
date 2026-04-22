import { describe, expect, it } from "vitest"
import { parseSrcParam } from "../parse-src-param"
import { parseSegmentKey } from "../translation/parse-segment-key"

describe("parseSrcParam", () => {
  it("returns url when ?src= present", () => {
    expect(parseSrcParam("?src=https%3A%2F%2Fa.com%2Fx.pdf")).toBe("https://a.com/x.pdf")
  })
  it("returns null when missing", () => {
    expect(parseSrcParam("")).toBeNull()
  })
  it("returns null when src is empty", () => {
    expect(parseSrcParam("?src=")).toBeNull()
  })
  it("returns url when src= is combined with other params", () => {
    expect(parseSrcParam("?foo=bar&src=https%3A%2F%2Fa.com%2Fx.pdf")).toBe("https://a.com/x.pdf")
  })
  it("preserves encoded fragment in src value", () => {
    expect(parseSrcParam("?src=https%3A%2F%2Fa.com%2Fx.pdf%23page%3D2")).toBe("https://a.com/x.pdf#page=2")
  })
})

describe("parseSegmentKey", () => {
  it("extracts pageIndex + paragraphIndex from a well-formed key", () => {
    expect(parseSegmentKey("abc123:p-0-0")).toEqual({ pageIndex: 0, paragraphIndex: 0 })
    expect(parseSegmentKey("abc123:p-12-345")).toEqual({ pageIndex: 12, paragraphIndex: 345 })
  })
  it("tolerates a fileHash that contains no `:` separators other than the canonical one", () => {
    expect(parseSegmentKey("a-long-sha256-hex:p-7-2")).toEqual({ pageIndex: 7, paragraphIndex: 2 })
  })
  it("returns null for a malformed suffix", () => {
    expect(parseSegmentKey("abc:not-a-paragraph-key")).toBeNull()
    expect(parseSegmentKey("abc:p-0")).toBeNull()
    expect(parseSegmentKey("abc:p--1-2")).toBeNull()
  })
  it("returns null when the separator is missing", () => {
    expect(parseSegmentKey("p-0-0")).toBeNull()
  })
  it("returns null for empty input", () => {
    expect(parseSegmentKey("")).toBeNull()
  })
})
