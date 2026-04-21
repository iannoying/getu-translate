export interface LibreInput { text: string, from: string, to: string, endpoint: string, apiKey?: string }
export interface LibreOutput { text: string }

export async function translateLibre(input: LibreInput): Promise<LibreOutput> {
  const body: Record<string, string> = { q: input.text, source: input.from, target: input.to, format: "text" }
  const apiKey = input.apiKey?.trim()
  if (apiKey)
    body.api_key = apiKey
  const res = await fetch(input.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw new Error(`LibreTranslate HTTP ${res.status}`)
  let data: { translatedText?: string, error?: string }
  try {
    data = await res.json()
  }
  catch {
    throw new Error("LibreTranslate: invalid JSON response")
  }
  if (data.error)
    throw new Error(`LibreTranslate: ${data.error}`)
  return { text: data.translatedText ?? "" }
}
