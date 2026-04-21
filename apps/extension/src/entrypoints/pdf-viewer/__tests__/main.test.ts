import { describe, expect, it } from "vitest"
import { parseSrcParam } from "../parse-src-param"

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
