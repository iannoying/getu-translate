import { describe, expect, it, vi } from "vitest"
import { PDFDocument } from "pdf-lib"
import {
  fetchPdfFromUrl,
  isPrivateHostname,
  looksLikePdf,
  presignPut,
  readPdfPageCount,
  tryBuildR2Signer,
} from "../document"

describe("isPrivateHostname", () => {
  it.each([
    ["localhost", true],
    ["foo.localhost", true],
    ["service.internal", true],
    ["service.local", true],
    ["127.0.0.1", true],
    ["10.0.0.1", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true], // AWS/GCP metadata service
    ["0.0.0.0", true],
    ["::1", true],
    ["fe80::1", true],
    ["fd00::1", true],
    // IPv4-mapped IPv6 — must be caught even though they look like v6 addresses
    ["::ffff:127.0.0.1", true],
    ["::ffff:169.254.169.254", true], // metadata service via v6 notation
    ["::ffff:10.0.0.1", true],
  ])("rejects private hostname %s", (host, expected) => {
    expect(isPrivateHostname(host)).toBe(expected)
  })

  it.each([
    ["arxiv.org", false],
    ["openreview.net", false],
    ["8.8.8.8", false],
    ["172.32.0.1", false], // outside the 172.16-31 private range
    ["172.15.0.1", false],
    ["::ffff:8.8.8.8", false], // public IPv4 via v6 mapping is allowed
  ])("accepts public hostname %s", (host, expected) => {
    expect(isPrivateHostname(host)).toBe(expected)
  })
})

describe("looksLikePdf", () => {
  function url(href: string): URL {
    return new URL(href)
  }

  it("accepts application/pdf content-type", () => {
    expect(looksLikePdf(url("https://example.com/doc"), "application/pdf")).toBe(true)
  })

  it("accepts octet-stream + .pdf path", () => {
    expect(looksLikePdf(url("https://example.com/file.pdf"), "application/octet-stream")).toBe(true)
  })

  it("accepts .pdf path even with text/html content-type (CDN edge cases)", () => {
    expect(looksLikePdf(url("https://example.com/doc.pdf"), "text/html")).toBe(true)
  })

  it("accepts arxiv /pdf/<id> with no extension", () => {
    expect(looksLikePdf(url("https://arxiv.org/pdf/2401.00000"), "application/pdf")).toBe(true)
  })

  it("accepts openreview /pdf?id=...", () => {
    expect(looksLikePdf(url("https://openreview.net/pdf?id=abc"), "application/pdf")).toBe(true)
  })

  it("rejects non-pdf content-type and non-pdf path", () => {
    expect(looksLikePdf(url("https://example.com/index.html"), "text/html")).toBe(false)
  })
})

describe("readPdfPageCount", () => {
  it("returns the page count of a valid PDF", async () => {
    const doc = await PDFDocument.create()
    doc.addPage([100, 100])
    doc.addPage([100, 100])
    doc.addPage([100, 100])
    const bytes = await doc.save()
    expect(await readPdfPageCount(bytes)).toBe(3)
  })

  it("throws SCANNED_PDF on garbage bytes", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await expect(readPdfPageCount(garbage)).rejects.toMatchObject({ code: "SCANNED_PDF" })
  })
})

describe("tryBuildR2Signer", () => {
  it("returns null when secrets missing", () => {
    expect(tryBuildR2Signer({} as any)).toBeNull()
  })

  it("returns null when only some secrets bound", () => {
    expect(
      tryBuildR2Signer({
        R2_ACCOUNT_ID: "acc",
        R2_ACCESS_KEY_ID: "key",
        // secret + bucket missing
      } as any),
    ).toBeNull()
  })

  it("returns signer when all secrets bound", () => {
    const signer = tryBuildR2Signer({
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_PDFS_NAME: "getu-pdfs",
    } as any)
    expect(signer).not.toBeNull()
    expect(signer?.endpoint).toBe("https://acc.r2.cloudflarestorage.com")
    expect(signer?.bucket).toBe("getu-pdfs")
  })
})

describe("presignPut — signed headers", () => {
  it("includes content-length and content-type in X-Amz-SignedHeaders", async () => {
    const signer = tryBuildR2Signer({
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_PDFS_NAME: "getu-pdfs",
    } as any)
    expect(signer).not.toBeNull()
    const url = await presignPut(signer!, "pdfs/user/job/source.pdf", 12345)
    const parsed = new URL(url)
    const signedHeaders = parsed.searchParams.get("X-Amz-SignedHeaders") ?? ""
    expect(signedHeaders).toContain("content-length")
    expect(signedHeaders).toContain("content-type")
  })
})

describe("fetchPdfFromUrl — SSRF + content-type guards", () => {
  it("rejects unsupported protocol", async () => {
    await expect(fetchPdfFromUrl("file:///etc/passwd", 50_000_000)).rejects.toMatchObject({
      code: "INVALID_PROTOCOL",
    })
  })

  it("rejects private hostname", async () => {
    await expect(fetchPdfFromUrl("http://169.254.169.254/latest/meta-data/", 50_000_000)).rejects.toMatchObject({
      code: "PRIVATE_HOST",
    })
  })

  it("rejects redirect (manual mode + 3xx)", async () => {
    const fakeFetch = vi.fn(async () => new Response("", { status: 302, headers: { location: "https://other" } }))
    await expect(
      fetchPdfFromUrl("https://example.com/foo.pdf", 50_000_000, fakeFetch as any),
    ).rejects.toMatchObject({ code: "REDIRECT_BLOCKED" })
  })

  it("rejects non-PDF content-type", async () => {
    const fakeFetch = vi.fn(async () => new Response("<html/>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }))
    await expect(
      fetchPdfFromUrl("https://example.com/landing", 50_000_000, fakeFetch as any),
    ).rejects.toMatchObject({ code: "NOT_PDF" })
  })

  it("rejects when declared content-length exceeds cap", async () => {
    const fakeFetch = vi.fn(async () => new Response("ignored", {
      status: 200,
      headers: { "content-type": "application/pdf", "content-length": "100000000" }, // 100 MB
    }))
    await expect(
      fetchPdfFromUrl("https://example.com/big.pdf", 50_000_000, fakeFetch as any),
    ).rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  it("rejects when streamed body exceeds cap (cap mid-stream, not after)", async () => {
    // Streaming a 2-chunk body where total exceeds 1KB cap.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700))
        controller.enqueue(new Uint8Array(700))
        controller.close()
      },
    })
    const fakeFetch = vi.fn(async () => new Response(stream as any, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }))
    await expect(
      fetchPdfFromUrl("https://example.com/big.pdf", 1024, fakeFetch as any),
    ).rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  it("happy path: returns bytes and content-type", async () => {
    const doc = await PDFDocument.create()
    doc.addPage([100, 100])
    const pdfBytes = await doc.save()
    const fakeFetch = vi.fn(async () => new Response(pdfBytes, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }))
    const out = await fetchPdfFromUrl("https://arxiv.org/pdf/2401.00000", 50_000_000, fakeFetch as any)
    expect(out.contentType).toBe("application/pdf")
    expect(out.bytes.byteLength).toBe(pdfBytes.byteLength)
    expect(out.finalUrl.hostname).toBe("arxiv.org")
  })
})
