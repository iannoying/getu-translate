import { describe, expect, it } from "vitest"
import { extractDomain, FILE_PROTOCOL_DOMAIN } from "../domain"

describe("extractDomain", () => {
  it("returns hostname for https URLs", () => {
    expect(extractDomain("https://a.b.com/x.pdf")).toBe("a.b.com")
  })

  it("returns hostname for http URLs", () => {
    expect(extractDomain("http://example.com/foo/bar.pdf")).toBe("example.com")
  })

  it("lowercases hostnames", () => {
    expect(extractDomain("https://A.COM/x.pdf")).toBe("a.com")
    expect(extractDomain("HTTPS://MiXeD.Case.Org/x.pdf")).toBe("mixed.case.org")
  })

  it("returns the file:// sentinel for local file URLs", () => {
    expect(extractDomain("file:///tmp/x.pdf")).toBe(FILE_PROTOCOL_DOMAIN)
    expect(extractDomain("file:///C:/Users/test/doc.pdf")).toBe(FILE_PROTOCOL_DOMAIN)
  })

  it("returns an empty string for malformed input", () => {
    expect(extractDomain("not-a-url")).toBe("")
    expect(extractDomain("")).toBe("")
  })

  it("strips port + path + query + fragment", () => {
    expect(extractDomain("https://a.com:8443/x.pdf?y=1#p=2")).toBe("a.com")
  })
})
