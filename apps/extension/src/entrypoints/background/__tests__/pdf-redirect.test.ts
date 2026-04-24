import { describe, expect, it } from "vitest"
import { decideRedirect } from "../pdf-redirect"

const base = {
  activationMode: "always" as const,
  enabled: true,
  blocklistDomains: [] as string[],
  allowFileProtocol: true,
  viewerOrigin: "chrome-extension://abc",
}

describe("decideRedirect", () => {
  it("redirects https .pdf when enabled + always", () => {
    const d = decideRedirect({ ...base, targetUrl: "https://a.com/x.pdf" })
    expect(d.action).toBe("redirect")
    if (d.action === "redirect") {
      expect(d.viewerUrl).toBe("chrome-extension://abc/pdf-viewer.html?src=https%3A%2F%2Fa.com%2Fx.pdf")
    }
  })

  it("skips when enabled=false", () => {
    expect(
      decideRedirect({ ...base, enabled: false, targetUrl: "https://a.com/x.pdf" }).action,
    ).toBe("skip")
  })

  it("skips when activationMode=manual", () => {
    expect(
      decideRedirect({ ...base, activationMode: "manual", targetUrl: "https://a.com/x.pdf" })
        .action,
    ).toBe("skip")
  })

  it("skips file:// when allowFileProtocol=false", () => {
    expect(
      decideRedirect({ ...base, allowFileProtocol: false, targetUrl: "file:///tmp/a.pdf" }).action,
    ).toBe("skip")
  })

  it("redirects file:// when allowFileProtocol=true", () => {
    expect(
      decideRedirect({ ...base, targetUrl: "file:///tmp/a.pdf" }).action,
    ).toBe("redirect")
  })

  it("skips domain in blocklist", () => {
    expect(
      decideRedirect({
        ...base,
        blocklistDomains: ["evil.com"],
        targetUrl: "https://evil.com/x.pdf",
      }).action,
    ).toBe("skip")
  })

  it("skips non-.pdf url", () => {
    expect(
      decideRedirect({ ...base, targetUrl: "https://a.com/page" }).action,
    ).toBe("skip")
  })

  it("skips URL with .pdf in query but not in path", () => {
    expect(
      decideRedirect({ ...base, targetUrl: "https://a.com/p?x=y.pdf" }).action,
    ).toBe("skip")
  })

  it("redirects .pdf path with query string", () => {
    const d = decideRedirect({ ...base, targetUrl: "https://a.com/x.pdf?t=1" })
    expect(d.action).toBe("redirect")
  })

  it("mode=ask still redirects (confirm UX happens inside viewer)", () => {
    expect(
      decideRedirect({ ...base, activationMode: "ask", targetUrl: "https://a.com/x.pdf" }).action,
    ).toBe("redirect")
  })

  it("skips self-recursion on our own viewer URL", () => {
    expect(
      decideRedirect({
        ...base,
        targetUrl:
          "chrome-extension://abc/pdf-viewer.html?src=https%3A%2F%2Fa.com%2Fx.pdf",
      }).action,
    ).toBe("skip")
  })

  it("skips domain in blocklist via direct subdomain match", () => {
    // Direct subdomain of blocklisted domain should also be skipped
    expect(
      decideRedirect({
        ...base,
        blocklistDomains: ["evil.com"],
        targetUrl: "https://docs.evil.com/x.pdf",
      }).action,
    ).toBe("skip")
  })

  it("skips domain in blocklist via multi-depth subdomain match", () => {
    // Any-depth subdomain — documents that `.endsWith("." + blocked)` is depth-unlimited
    expect(
      decideRedirect({
        ...base,
        blocklistDomains: ["evil.com"],
        targetUrl: "https://a.b.evil.com/x.pdf",
      }).action,
    ).toBe("skip")
  })

  it("preserves fragment in viewerUrl via encoding", () => {
    const d = decideRedirect({ ...base, targetUrl: "https://a.com/file.pdf#page=3" })
    expect(d.action).toBe("redirect")
    if (d.action === "redirect") {
      expect(d.viewerUrl).toContain("%23page%3D3")
    }
  })

  it("treats .PDF (uppercase) path as pdf", () => {
    expect(
      decideRedirect({ ...base, targetUrl: "https://a.com/FILE.PDF" }).action,
    ).toBe("redirect")
  })

  it("skips malformed targetUrl gracefully", () => {
    expect(
      decideRedirect({ ...base, targetUrl: "not a url" }).action,
    ).toBe("skip")
  })

  // ---- source: "content-type" (fallback path for URLs without .pdf suffix) ----

  it("content-type: redirects arxiv-style URL without .pdf suffix", () => {
    const d = decideRedirect({
      ...base,
      targetUrl: "https://arxiv.org/pdf/2507.15551",
      source: "content-type",
    })
    expect(d.action).toBe("redirect")
    if (d.action === "redirect") {
      expect(d.viewerUrl).toBe(
        "chrome-extension://abc/pdf-viewer.html?src=https%3A%2F%2Farxiv.org%2Fpdf%2F2507.15551",
      )
    }
  })

  it("content-type: still respects manual mode", () => {
    expect(
      decideRedirect({
        ...base,
        activationMode: "manual",
        targetUrl: "https://arxiv.org/pdf/2507.15551",
        source: "content-type",
      }).action,
    ).toBe("skip")
  })

  it("content-type: still respects enabled=false", () => {
    expect(
      decideRedirect({
        ...base,
        enabled: false,
        targetUrl: "https://arxiv.org/pdf/2507.15551",
        source: "content-type",
      }).action,
    ).toBe("skip")
  })

  it("content-type: still respects blocklist", () => {
    expect(
      decideRedirect({
        ...base,
        blocklistDomains: ["arxiv.org"],
        targetUrl: "https://arxiv.org/pdf/2507.15551",
        source: "content-type",
      }).action,
    ).toBe("skip")
  })

  it("content-type: still respects self-recursion guard", () => {
    expect(
      decideRedirect({
        ...base,
        targetUrl:
          "chrome-extension://abc/pdf-viewer.html?src=https%3A%2F%2Farxiv.org%2Fpdf%2F2507.15551",
        source: "content-type",
      }).action,
    ).toBe("skip")
  })

  it("content-type: rejects non-http(s)/file protocols", () => {
    expect(
      decideRedirect({
        ...base,
        targetUrl: "data:application/pdf;base64,JVBERi0=",
        source: "content-type",
      }).action,
    ).toBe("skip")
  })

  it("content-type: also works for .pdf-suffixed URLs (idempotent)", () => {
    // Shouldn't happen in practice (onBeforeNavigate handles suffix URLs first),
    // but the content-type path must not regress the suffix case.
    expect(
      decideRedirect({
        ...base,
        targetUrl: "https://a.com/x.pdf",
        source: "content-type",
      }).action,
    ).toBe("redirect")
  })

  it("default source is path-suffix (backward compat)", () => {
    // No `source` → must behave exactly like before this change.
    expect(
      decideRedirect({ ...base, targetUrl: "https://arxiv.org/pdf/2507.15551" }).action,
    ).toBe("skip")
  })
})
