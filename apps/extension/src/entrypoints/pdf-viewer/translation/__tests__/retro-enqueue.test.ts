import type { Paragraph } from "../../paragraph/types"
import { describe, expect, it, vi } from "vitest"
import { runRetroEnqueue } from "../retro-enqueue"

/**
 * Fabricate a minimal `Paragraph` — we only care about `key` for these
 * tests; the rest of the shape is cast-compatible with production code.
 */
function makeParagraph(pageIndex: number, paragraphIndex: number): Paragraph {
  return {
    items: [],
    text: "",
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    fontSize: 0,
    key: `p-${pageIndex}-${paragraphIndex}`,
  }
}

describe("runRetroEnqueue", () => {
  it("calls startPage for every known entry when quota is NOT exhausted", () => {
    const known = new Map<number, Paragraph[]>([
      [1, [makeParagraph(0, 0)]],
      [2, [makeParagraph(1, 0), makeParagraph(1, 1)]],
      [3, [makeParagraph(2, 0)]],
    ])
    const startPage = vi.fn()

    runRetroEnqueue({
      knownParagraphs: known,
      isQuotaExhausted: () => false,
      startPage,
    })

    expect(startPage).toHaveBeenCalledTimes(3)
    // pdfjs pageNumber is 1-based; the helper converts to 0-based pageIndex.
    expect(startPage).toHaveBeenNthCalledWith(1, 0, known.get(1))
    expect(startPage).toHaveBeenNthCalledWith(2, 1, known.get(2))
    expect(startPage).toHaveBeenNthCalledWith(3, 2, known.get(3))
  })

  it("skips every entry when quota is ALREADY exhausted before the loop starts", () => {
    const known = new Map<number, Paragraph[]>([
      [1, [makeParagraph(0, 0)]],
      [2, [makeParagraph(1, 0)]],
    ])
    const startPage = vi.fn()

    runRetroEnqueue({
      knownParagraphs: known,
      isQuotaExhausted: () => true,
      startPage,
    })

    expect(startPage).not.toHaveBeenCalled()
  })

  it("stops dispatching as soon as the quota flips mid-loop", () => {
    const known = new Map<number, Paragraph[]>([
      [1, [makeParagraph(0, 0)]],
      [2, [makeParagraph(1, 0)]],
      [3, [makeParagraph(2, 0)]],
      [4, [makeParagraph(3, 0)]],
    ])
    const startPage = vi.fn()
    // Simulate: the isExhausted predicate starts false, flips true after
    // the second page has been dispatched (external state flip from a
    // concurrent onPageSuccess in production).
    let callsBeforeExhaustion = 2
    const isQuotaExhausted = vi.fn(() => {
      if (callsBeforeExhaustion > 0) {
        callsBeforeExhaustion--
        return false
      }
      return true
    })

    runRetroEnqueue({
      knownParagraphs: known,
      isQuotaExhausted,
      startPage,
    })

    expect(startPage).toHaveBeenCalledTimes(2)
    expect(startPage).toHaveBeenNthCalledWith(1, 0, known.get(1))
    expect(startPage).toHaveBeenNthCalledWith(2, 1, known.get(2))
  })

  it("is a no-op when knownParagraphs is empty", () => {
    const startPage = vi.fn()
    const isQuotaExhausted = vi.fn(() => false)
    runRetroEnqueue({
      knownParagraphs: new Map(),
      isQuotaExhausted,
      startPage,
    })
    expect(startPage).not.toHaveBeenCalled()
    // Predicate shouldn't even be checked on an empty map — the for..of
    // loop exits immediately.
    expect(isQuotaExhausted).not.toHaveBeenCalled()
  })

  it("iterates in Map insertion order, preserving reading order of the source pages", () => {
    // Insert out-of-order page numbers; the Map spec guarantees insertion
    // order on iteration, which mirrors the order knownParagraphsRef was
    // populated at textlayerrendered time.
    const known = new Map<number, Paragraph[]>()
    known.set(5, [makeParagraph(4, 0)])
    known.set(2, [makeParagraph(1, 0)])
    known.set(9, [makeParagraph(8, 0)])
    const calls: number[] = []
    runRetroEnqueue({
      knownParagraphs: known,
      isQuotaExhausted: () => false,
      startPage: (pageIndex) => {
        calls.push(pageIndex)
      },
    })
    expect(calls).toEqual([4, 1, 8])
  })
})
