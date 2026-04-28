import { describe, expect, it, vi } from "vitest"
import { bianxieLlmTranslate, TRANSLATE_MODEL_TO_BIANXIE } from "../llm-providers"

const env = {
  BIANXIE_API_KEY: "bx-test-key",
  BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
}

describe("bianxieLlmTranslate — happy path", () => {
  it("calls bianxie chat/completions and returns translation + usage", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "你好，世界。" } }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch

    const out = await bianxieLlmTranslate(
      "deepseek-v4-pro",
      "Hello, world.",
      "auto",
      "zh-Hans",
      env,
      fetchSpy,
    )

    expect(out.text).toBe("你好，世界。")
    expect(out.tokens).toEqual({ input: 12, output: 7 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.bianxie.ai/v1/chat/completions")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer bx-test-key")
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe("deepseek-v4-pro") // bianxie name = TranslateModelId for this one
    expect(body.stream).toBe(false)
    expect(Array.isArray(body.messages)).toBe(true)
    // System prompt must mention source + target lang for the model to translate, not chat
    const sys = body.messages.find((m: { role: string }) => m.role === "system")
    expect(sys.content).toMatch(/auto/i)
    expect(sys.content).toMatch(/zh-Hans/i)
    // User message contains the source text
    const user = body.messages.find((m: { role: string }) => m.role === "user")
    expect(user.content).toBe("Hello, world.")
  })

  it("maps qwen-3.5-plus → qwen3.5-plus (bianxie naming)", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await bianxieLlmTranslate("qwen-3.5-plus", "hi", "en", "zh-Hans", env, fetchSpy)
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.model).toBe("qwen3.5-plus")
  })

  it("exports TRANSLATE_MODEL_TO_BIANXIE with exactly the 8 bianxie-published Pro models", () => {
    // Ensures we don't silently lose a model when TRANSLATE_MODELS changes.
    // coder-claude-4.7-opus is intentionally absent (bianxie hasn't published it yet).
    expect(Object.keys(TRANSLATE_MODEL_TO_BIANXIE).sort()).toEqual(
      [
        "claude-sonnet-4-6",
        "deepseek-v4-pro",
        "gemini-3-flash-preview",
        "gemini-3.1-pro-preview",
        "glm-5.1",
        "gpt-5.4-mini",
        "gpt-5.5",
        "qwen-3.5-plus",
      ].sort(),
    )
  })
})
