import { describe, expect, it, vi } from "vitest"
import { makeTranslateChunkFn } from "../document-translators"
import type { Chunk } from "../document-chunker"

describe("makeTranslateChunkFn", () => {
  const chunk: Chunk = { index: 0, text: "Hello, world.", startPage: 1, endPage: 1 }
  const ctx = { modelId: "google" as const, sourceLang: "auto", targetLang: "zh-Hans" }

  it("calls dispatchTranslate for a known model and returns the translated text", async () => {
    // Mock global fetch for the google translate call
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([[["你好，世界。", "Hello, world.", null, null, 0]]]), {
        status: 200,
      }),
    ) as unknown as typeof fetch
    vi.stubGlobal("fetch", fetchMock)

    try {
      const fn = makeTranslateChunkFn()
      const out = await fn(chunk, ctx, new AbortController().signal)
      expect(out).toContain("你好")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("returns the LLM stub for an LLM model id", async () => {
    const fn = makeTranslateChunkFn()
    const out = await fn(
      { ...chunk, text: "Hi" },
      { modelId: "claude-sonnet-4-6", sourceLang: "auto", targetLang: "zh-Hans" },
      new AbortController().signal,
    )
    expect(out).toContain("[Pro stub:")
    expect(out).toContain("Hi")
  })

  it("throws for an unknown modelId", async () => {
    const fn = makeTranslateChunkFn()
    await expect(
      fn(chunk, { modelId: "nope-not-a-model", sourceLang: "auto", targetLang: "zh-Hans" }, new AbortController().signal),
    ).rejects.toThrow(/unknown modelId/)
  })
})
