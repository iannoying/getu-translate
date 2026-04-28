// apps/api/src/translate/__tests__/dispatch.test.ts
import { describe, expect, it, vi } from "vitest"
import { dispatchTranslate } from "../dispatch"

const env = {
  BIANXIE_API_KEY: "bx-test",
  BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
}

describe("dispatchTranslate — LLM branch (real bianxie call)", () => {
  it("returns real text + tokens for a whitelisted Pro model (gpt-5.5)", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "你好" } }],
          usage: { prompt_tokens: 5, completion_tokens: 2 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch
    vi.stubGlobal("fetch", fetchSpy)
    try {
      const out = await dispatchTranslate("gpt-5.5", "hi", "auto", "zh-Hans", env)
      expect(out.text).toBe("你好")
      expect(out.tokens).toEqual({ input: 5, output: 2 })
      // No more stub prefix
      expect(out.text).not.toMatch(/Pro stub/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("propagates upstream 429 as TranslateProviderError", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response("rate limited", { status: 429 }),
    ) as unknown as typeof fetch
    vi.stubGlobal("fetch", fetchSpy)
    try {
      await expect(
        dispatchTranslate("gpt-5.5", "hi", "auto", "zh-Hans", env),
      ).rejects.toMatchObject({
        name: "TranslateProviderError",
        statusCode: 429,
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("throws TranslateProviderError for unrouted LLM (coder-claude-4.7-opus, not on bianxie yet)", async () => {
    await expect(
      dispatchTranslate("coder-claude-4.7-opus", "hi", "auto", "zh-Hans", env),
    ).rejects.toMatchObject({
      name: "TranslateProviderError",
      providerId: "coder-claude-4.7-opus",
    })
  })

  it("routes gpt-5.4-mini through bianxie even though it's outside contract AI_MODEL_COEFFICIENTS", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch
    vi.stubGlobal("fetch", fetchSpy)
    try {
      const out = await dispatchTranslate("gpt-5.4-mini", "hi", "auto", "zh-Hans", env)
      expect(out.text).toBe("ok")
      expect(out.tokens).toEqual({ input: 3, output: 2 })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("dispatchTranslate — free providers still work", () => {
  it("google still calls free provider with tokens=null", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify([[["你好", "hi", null, null, 0]]]), {
        status: 200,
      }),
    ) as unknown as typeof fetch
    vi.stubGlobal("fetch", fetchSpy)
    try {
      const out = await dispatchTranslate("google", "hi", "auto", "zh-Hans", env)
      expect(out.text).toContain("你好")
      expect(out.tokens).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
