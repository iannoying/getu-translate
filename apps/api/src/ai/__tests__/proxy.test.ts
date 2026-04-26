import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AiProxyQuotaBucket } from "../jwt"
import { handleChatCompletions } from "../proxy"

vi.mock("../jwt", () => ({
  isAiProxyQuotaBucket: (value: unknown) =>
    value === "ai_translate_monthly" || value === "web_text_translate_token_monthly",
  verifyAiJwt: vi.fn(),
}))
vi.mock("../rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  RATE_LIMIT_PER_MINUTE: 300,
}))
vi.mock("../../billing/quota", () => ({
  assertCanConsumeQuotaBucket: vi.fn(async () => undefined),
  consumeQuota: vi.fn(async () => ({
    bucket: "ai_translate_monthly",
    remaining: 99000,
    reset_at: null,
  })),
}))
vi.mock("@getu/db", () => ({
  createDb: vi.fn(() => ({}) as any),
}))

const env = {
  BIANXIE_API_KEY: "bx-key",
  BIANXIE_BASE_URL: "https://api.bianxie.ai/v1",
  AI_JWT_SECRET: "x".repeat(48),
  DB: {} as any,
} as any

function verifiedJwt(quotaBucket: AiProxyQuotaBucket = "ai_translate_monthly") {
  return { userId: "u1", exp: 9e9, quotaBucket }
}

function fakeCtx() {
  const pending: Promise<unknown>[] = []
  return {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p)
    },
    async drain() {
      await Promise.allSettled(pending)
    },
  }
}

describe("handleChatCompletions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("401 when missing Bearer", async () => {
    const req = new Request("https://x/ai/v1/chat/completions", { method: "POST", body: "{}" })
    const r = await handleChatCompletions(req, env, {} as any)
    expect(r.status).toBe(401)
  })

  it("401 when JWT invalid", async () => {
    const { verifyAiJwt } = await import("../jwt")
    vi.mocked(verifyAiJwt).mockRejectedValueOnce(new Error("bad"))
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer bad" },
      body: "{}",
    })
    const r = await handleChatCompletions(req, env, {} as any)
    expect(r.status).toBe(401)
  })

  it("400 when model not in whitelist", async () => {
    const { verifyAiJwt } = await import("../jwt")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt())
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer ok" },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
    })
    const r = await handleChatCompletions(req, env, {} as any)
    expect(r.status).toBe(400)
    const j = (await r.json()) as { error: string }
    expect(j.error).toMatch(/whitelist/i)
  })

  it("forwards to bianxie with injected key and streams response", async () => {
    const { verifyAiJwt } = await import("../jwt")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt())
    const fetchSpy = vi.fn(
      async () =>
        new Response(`data: [DONE]\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    )
    vi.stubGlobal("fetch", fetchSpy)
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer ok" },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    })
    const r = await handleChatCompletions(req, env, fakeCtx() as any)
    expect(r.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.bianxie.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer bx-key" }),
      }),
    )
    // Body should include stream_options.include_usage = true
    const call = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit
    const bodyJson = JSON.parse(call.body as string)
    expect(bodyJson.stream_options).toEqual({ include_usage: true })
  })

  it("502 when upstream fails", async () => {
    const { verifyAiJwt } = await import("../jwt")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt())
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })))
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer ok" },
      body: JSON.stringify({ model: "deepseek-v4-pro", messages: [{ role: "user", content: "hi" }] }),
    })
    const r = await handleChatCompletions(req, env, {} as any)
    expect(r.status).toBe(502)
  })

  it("calls consumeQuota after streaming with parsed usage", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt())
    const sse = [
      `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n`,
      `data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":200}}\n\n`,
      `data: [DONE]\n\n`,
    ].join("")
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    )
    const ctx = fakeCtx()
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer ok", "x-request-id": "req-42" },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    })
    const r = await handleChatCompletions(req, env, ctx as any)
    // Drain the stream
    const reader = r.body!.getReader()
    while (!(await reader.read()).done) {}
    await ctx.drain()
    // deepseek-v4-pro: 100*1 + 200*4 = 900 units
    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "ai_translate_monthly",
      900,
      "req-42",
      undefined,
      "deepseek-v4-pro",
      100,
      200,
    )
  })

  it("charges the web text token bucket with web /translate token coefficients", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt("web_text_translate_token_monthly"))
    const sse = [
      `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n`,
      `data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":200}}\n\n`,
      `data: [DONE]\n\n`,
    ].join("")
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    )
    const ctx = fakeCtx()
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer ok",
        "x-request-id": "sidebar-token-req",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    })

    const r = await handleChatCompletions(req, env, ctx as any)
    const reader = r.body!.getReader()
    while (!(await reader.read()).done) {}
    await ctx.drain()

    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "web_text_translate_token_monthly",
      17000,
      "sidebar-token-req",
      undefined,
      "claude-sonnet-4-6",
      100,
      200,
    )
  })

  it("403s before quota preflight when the requested bucket is not authorized by the JWT", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { assertCanConsumeQuotaBucket, consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt("ai_translate_monthly"))
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 200 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchSpy)

    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer ok",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
      }),
    })

    const r = await handleChatCompletions(req, env, fakeCtx() as any)
    const body = (await r.json()) as { code?: string, error: string }

    expect(r.status).toBe(403)
    expect(body.code).toBe("FORBIDDEN")
    expect(body.error).toMatch(/not authorized/i)
    expect(assertCanConsumeQuotaBucket).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(consumeQuota).not.toHaveBeenCalled()
  })

  it("403s before upstream fetch when quota bucket preflight is forbidden", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { assertCanConsumeQuotaBucket, consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt("web_text_translate_token_monthly"))
    vi.mocked(assertCanConsumeQuotaBucket).mockRejectedValueOnce(
      Object.assign(new Error("Tier 'free' cannot access bucket 'web_text_translate_token_monthly'"), {
        code: "FORBIDDEN",
      }),
    )
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 200 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchSpy)

    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer ok",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
      }),
    })

    const r = await handleChatCompletions(req, env, fakeCtx() as any)
    const body = (await r.json()) as { error: string }

    expect(r.status).toBe(403)
    expect(body.error).toMatch(/forbidden|cannot access/i)
    expect(assertCanConsumeQuotaBucket).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "web_text_translate_token_monthly",
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(consumeQuota).not.toHaveBeenCalled()
  })

  it("429s before upstream fetch when quota bucket preflight is exhausted", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { assertCanConsumeQuotaBucket, consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt("web_text_translate_token_monthly"))
    vi.mocked(assertCanConsumeQuotaBucket).mockRejectedValueOnce(
      Object.assign(new Error("Bucket web_text_translate_token_monthly exhausted"), {
        code: "QUOTA_EXCEEDED",
      }),
    )
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 200 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchSpy)

    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer ok",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
      }),
    })

    const r = await handleChatCompletions(req, env, fakeCtx() as any)
    const body = (await r.json()) as { error: string }

    expect(r.status).toBe(429)
    expect(body.error).toMatch(/exhausted|exceeded/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(consumeQuota).not.toHaveBeenCalled()
  })

  it("falls back to the default quota bucket for unknown bucket headers", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt())
    const sse = [
      `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n`,
      `data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":1}}\n\n`,
      `data: [DONE]\n\n`,
    ].join("")
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    )
    const ctx = fakeCtx()
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer ok",
        "x-request-id": "req-unknown-bucket",
        "x-getu-quota-bucket": "not-a-real-bucket",
      },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    })

    const r = await handleChatCompletions(req, env, ctx as any)
    const reader = r.body!.getReader()
    while (!(await reader.read()).done) {}
    await ctx.drain()

    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "ai_translate_monthly",
      14,
      "req-unknown-bucket",
      undefined,
      "deepseek-v4-pro",
      10,
      1,
    )
  })

  it("429 when rate limited", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { checkRateLimit } = await import("../rate-limit")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt())
    vi.mocked(checkRateLimit).mockResolvedValueOnce(false)

    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer ok" },
      body: JSON.stringify({ model: "deepseek-v4-pro", messages: [{ role: "user", content: "hi" }] }),
    })
    const r = await handleChatCompletions(req, env, fakeCtx() as any)
    expect(r.status).toBe(429)
    const body = (await r.json()) as { error: string }
    expect(body.error).toMatch(/rate limit/i)
  })

  it("non-streaming branch: reads upstream as text and schedules charge", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt())
    const upstreamBody = JSON.stringify({
      choices: [{ message: { role: "assistant", content: "Hi" } }],
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(upstreamBody, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    )
    const ctx = fakeCtx()
    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer ok", "x-request-id": "req-ns" },
      body: JSON.stringify({ model: "deepseek-v4-pro", messages: [{ role: "user", content: "hi" }] }),
      // no stream: true
    })
    const r = await handleChatCompletions(req, env, ctx as any)
    expect(r.status).toBe(200)
    await ctx.drain()
    // deepseek-v4-pro: 50*1 + 10*4 = 90 units
    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "ai_translate_monthly",
      90,
      "req-ns",
      undefined,
      "deepseek-v4-pro",
      50,
      10,
    )
  })

  it("returns quota error instead of upstream JSON when web text token charge exceeds remaining quota", async () => {
    const { verifyAiJwt } = await import("../jwt")
    const { consumeQuota } = await import("../../billing/quota")
    vi.mocked(verifyAiJwt).mockResolvedValueOnce(verifiedJwt("web_text_translate_token_monthly"))
    vi.mocked(consumeQuota).mockRejectedValueOnce(
      Object.assign(new Error("Bucket web_text_translate_token_monthly exceeded"), {
        code: "QUOTA_EXCEEDED",
      }),
    )
    const upstreamBody = JSON.stringify({
      choices: [{ message: { role: "assistant", content: "paid output" } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(upstreamBody, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    )

    const req = new Request("https://x/ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer ok",
        "x-request-id": "sidebar-over-remaining",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
      }),
    })

    const r = await handleChatCompletions(req, env, fakeCtx() as any)
    const body = (await r.json()) as { error: string }

    expect(r.status).toBe(429)
    expect(body.error).toMatch(/exceeded/i)
    expect(JSON.stringify(body)).not.toContain("paid output")
    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "web_text_translate_token_monthly",
      17000,
      "sidebar-over-remaining",
      undefined,
      "claude-sonnet-4-6",
      100,
      200,
    )
  })
})
