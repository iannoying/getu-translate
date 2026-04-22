import { describe, expect, it } from "vitest"
import { extractUsageFromSSE } from "../usage-parser"

const SSE_WITH_USAGE = [
  `data: {"id":"cmpl-1","choices":[{"delta":{"content":"Hello"}}]}\n\n`,
  `data: {"id":"cmpl-1","choices":[{"delta":{"content":" world"}}]}\n\n`,
  `data: {"id":"cmpl-1","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n`,
  `data: [DONE]\n\n`,
].join("")

const SSE_WITHOUT_USAGE = [
  `data: {"id":"cmpl-1","choices":[{"delta":{"content":"Hi"}}]}\n\n`,
  `data: [DONE]\n\n`,
].join("")

describe("extractUsageFromSSE", () => {
  it("returns prompt + completion tokens", async () => {
    const stream = new Response(SSE_WITH_USAGE).body!
    const [tee, usageP] = extractUsageFromSSE(stream)
    const reader = tee.getReader()
    while (!(await reader.read()).done) {}
    expect(await usageP).toEqual({ input: 10, output: 20 })
  })

  it("falls back to null when usage missing", async () => {
    const stream = new Response(SSE_WITHOUT_USAGE).body!
    const [tee, usageP] = extractUsageFromSSE(stream)
    const reader = tee.getReader()
    while (!(await reader.read()).done) {}
    expect(await usageP).toBeNull()
  })
})
