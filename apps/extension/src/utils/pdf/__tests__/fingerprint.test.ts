import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fingerprintForPdf } from "../fingerprint"

/**
 * Pull the real `Sha256Hex` out of `@/utils/hash` without mocking — the
 * fallback path should produce a real SHA-256 hex string of the URL.
 */
async function realUrlHash(src: string): Promise<string> {
  const { Sha256Hex } = await import("@/utils/hash")
  return Sha256Hex(src)
}

/**
 * Build a fake `Response` whose `arrayBuffer()` returns the given bytes.
 */
function fakeResponse(bytes: Uint8Array, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer),
  } as unknown as Response
}

describe("fingerprintForPdf", () => {
  const fetchMock = vi.fn()
  const digestMock = vi.fn()
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

  beforeEach(() => {
    fetchMock.mockReset()
    digestMock.mockReset()
    warnSpy.mockClear()

    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("crypto", {
      subtle: {
        digest: digestMock,
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("hashes fetched PDF bytes into 64-char lower-case hex", async () => {
    // 32-byte digest filled with 0xAB → hex is "ab" repeated 32 times.
    const hashBytes = new Uint8Array(32).fill(0xAB)
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"

    fetchMock.mockResolvedValueOnce(fakeResponse(pdfBytes))
    digestMock.mockResolvedValueOnce(hashBytes.buffer)

    const hash = await fingerprintForPdf("https://example.com/paper.pdf")

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/paper.pdf", {
      credentials: "omit",
    })
    expect(digestMock).toHaveBeenCalledWith("SHA-256", expect.any(ArrayBuffer))
    expect(hash).toBe("ab".repeat(32))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("is deterministic — same bytes → same hash across calls", async () => {
    const hashBytes = new Uint8Array(32).fill(0x42)
    const pdfBytes = new Uint8Array([1, 2, 3, 4])

    fetchMock.mockResolvedValue(fakeResponse(pdfBytes))
    digestMock.mockResolvedValue(hashBytes.buffer)

    const a = await fingerprintForPdf("https://example.com/paper.pdf")
    const b = await fingerprintForPdf("https://example.com/paper.pdf")
    expect(a).toBe(b)
    expect(a).toBe("42".repeat(32))
  })

  it("falls back to a sha256 of the URL when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network error"))

    const src = "https://example.com/paper.pdf"
    const hash = await fingerprintForPdf(src)

    expect(hash).toBe(await realUrlHash(src))
    expect(digestMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain("fingerprintForPdf fetch failed")
  })

  it("falls back on non-OK HTTP response", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(new Uint8Array(0), false, 404))

    const src = "https://example.com/missing.pdf"
    const hash = await fingerprintForPdf(src)

    expect(hash).toBe(await realUrlHash(src))
    expect(digestMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it("returns different hashes for different byte content", async () => {
    const hashA = new Uint8Array(32).fill(0x11)
    const hashB = new Uint8Array(32).fill(0x22)

    fetchMock
      .mockResolvedValueOnce(fakeResponse(new Uint8Array([1])))
      .mockResolvedValueOnce(fakeResponse(new Uint8Array([2])))
    digestMock
      .mockResolvedValueOnce(hashA.buffer)
      .mockResolvedValueOnce(hashB.buffer)

    const a = await fingerprintForPdf("https://example.com/a.pdf")
    const b = await fingerprintForPdf("https://example.com/b.pdf")
    expect(a).not.toBe(b)
  })
})
