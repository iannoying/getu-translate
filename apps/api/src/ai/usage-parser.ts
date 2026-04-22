export function extractUsageFromSSE(
  source: ReadableStream<Uint8Array>,
): [ReadableStream<Uint8Array>, Promise<{ input: number; output: number } | null>] {
  const [a, b] = source.tee()
  const usageP = (async () => {
    const reader = b.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let found: { input: number; output: number } | null = null
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (payload === "[DONE]") continue
          try {
            const json = JSON.parse(payload) as {
              usage?: { prompt_tokens?: number; completion_tokens?: number }
            }
            const u = json.usage
            if (
              u &&
              typeof u.prompt_tokens === "number" &&
              typeof u.completion_tokens === "number"
            ) {
              found = { input: u.prompt_tokens, output: u.completion_tokens }
            }
          } catch {
            /* ignore non-JSON data lines */
          }
        }
      }
    }
    return found
  })()
  return [a, usageP]
}
