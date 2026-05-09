import type { TranslateModelId } from "@getu/definitions"

const GOOGLE_BASE = "https://translate.googleapis.com/translate_a/single"
const MICROSOFT_AUTH_URL = "https://edge.microsoft.com/translate/auth"
const MICROSOFT_TRANSLATE_BASE = "https://api-edge.cognitive.microsofttranslator.com/translate"
const BROWSER_FREE_PROVIDER_TIMEOUT_MS = 10_000

type BrowserFreeProviderId = Extract<TranslateModelId, "google" | "microsoft">

export type TranslateColumnInput = {
  text: string
  sourceLang: string
  targetLang: string
  modelId: TranslateModelId
  columnId: string
  clickId: string
}

type BrowserTranslateInput = TranslateColumnInput & { modelId: BrowserFreeProviderId; signal: AbortSignal }
type TranslateColumnOutput = { text: string }
type ServerTranslate = (
  input: TranslateColumnInput,
  opts: { signal: AbortSignal },
) => Promise<TranslateColumnOutput>
type DirectTranslate = (input: BrowserTranslateInput) => Promise<TranslateColumnOutput>

export function isBrowserFreeProvider(modelId: TranslateModelId): modelId is BrowserFreeProviderId {
  return modelId === "google" || modelId === "microsoft"
}

export async function runTranslateColumn(
  input: TranslateColumnInput,
  {
    signal,
    directTranslate = translateFreeModelInBrowser,
    serverTranslate,
  }: {
    signal: AbortSignal
    directTranslate?: DirectTranslate
    serverTranslate: ServerTranslate
  },
): Promise<TranslateColumnOutput> {
  if (!isBrowserFreeProvider(input.modelId)) {
    return serverTranslate(input, { signal })
  }

  try {
    return await directTranslate({ ...input, modelId: input.modelId, signal })
  } catch (err) {
    if (signal.aborted) throw err
    return serverTranslate(input, { signal })
  }
}

export async function translateFreeModelInBrowser({
  modelId,
  text,
  sourceLang,
  targetLang,
  signal,
  fetchImpl = fetch,
}: {
  modelId: BrowserFreeProviderId
  text: string
  sourceLang: string
  targetLang: string
  signal: AbortSignal
  fetchImpl?: typeof fetch
}): Promise<TranslateColumnOutput> {
  if (modelId === "google") {
    return { text: await googleTranslate(text, sourceLang, targetLang, signal, fetchImpl) }
  }
  return { text: await microsoftTranslate(text, sourceLang, targetLang, signal, fetchImpl) }
}

async function googleTranslate(
  sourceText: string,
  fromLang: string,
  toLang: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  const params = new URLSearchParams({
    client: "gtx",
    sl: fromLang,
    tl: toLang,
    dt: "t",
    strip: "1",
    nonced: "1",
    q: sourceText,
  })

  const resp = await fetchWithTimeout(
    fetchImpl,
    `${GOOGLE_BASE}?${params.toString()}`,
    { method: "GET" },
    signal,
  )
  if (!resp.ok) throw new Error(`Google translate HTTP ${resp.status}`)

  const raw = await resp.json() as unknown
  if (!Array.isArray(raw) || !Array.isArray(raw[0])) {
    throw new Error("Google translate: unexpected response format")
  }
  const parts: string[] = []
  for (const chunk of raw[0]) {
    if (Array.isArray(chunk) && typeof chunk[0] === "string") parts.push(chunk[0])
  }
  return parts.join("")
}

async function microsoftTranslate(
  sourceText: string,
  fromLang: string,
  toLang: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  const tokenResp = await fetchWithTimeout(fetchImpl, MICROSOFT_AUTH_URL, undefined, signal)
  if (!tokenResp.ok) throw new Error(`Microsoft translate auth HTTP ${tokenResp.status}`)
  const token = await tokenResp.text()

  const queryParams = new URLSearchParams({
    "api-version": "3.0",
    textType: "plain",
    to: toLang,
  })
  if (fromLang !== "auto") queryParams.set("from", fromLang)

  const resp = await fetchWithTimeout(
    fetchImpl,
    `${MICROSOFT_TRANSLATE_BASE}?${queryParams.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": token,
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify([{ Text: sourceText }]),
    },
    signal,
  )
  if (!resp.ok) throw new Error(`Microsoft translate HTTP ${resp.status}`)

  const raw = await resp.json() as unknown
  if (!Array.isArray(raw)) throw new Error("Microsoft translate: unexpected response format")
  const first = raw[0] as { translations?: Array<{ text?: string }> } | undefined
  const translated = first?.translations?.[0]?.text
  if (typeof translated !== "string") {
    throw new Error("Microsoft translate: missing translation text")
  }
  return translated
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit | undefined,
  signal: AbortSignal,
): Promise<Response> {
  if (signal.aborted) throw new DOMException("aborted", "AbortError")

  const ac = new AbortController()
  const onAbort = () => ac.abort()
  signal.addEventListener("abort", onAbort, { once: true })

  const timeoutId = setTimeout(() => ac.abort(), BROWSER_FREE_PROVIDER_TIMEOUT_MS)
  try {
    return await fetchImpl(input, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timeoutId)
    signal.removeEventListener("abort", onAbort)
  }
}
