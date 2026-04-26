/**
 * Free public translator HTTP wrappers used by the web /translate page's
 * Google and Microsoft columns. Both endpoints are unofficial / unstable
 * (no API key, but Google can rate-limit and Microsoft's edge auth token
 * can rotate). Treat any failure here as a per-column error — the parent
 * handler isolates failures so the other 10 columns are unaffected.
 *
 * Ported from `apps/extension/src/utils/host/translate/api/{google,microsoft}.ts`.
 * The extension version is identical in behavior; we keep two copies (rather
 * than a shared package) because (a) the extension imports its own logger
 * and error chrome and (b) the web /translate API surface may diverge later
 * (caching, model-specific quirks) without polluting the extension code.
 */

const GOOGLE_BASE = "https://translate.googleapis.com/translate_a/single"
const MICROSOFT_AUTH_URL = "https://edge.microsoft.com/translate/auth"
const MICROSOFT_TRANSLATE_BASE = "https://api-edge.cognitive.microsofttranslator.com/translate"

export class TranslateProviderError extends Error {
  readonly providerId: string
  readonly statusCode?: number
  constructor(providerId: string, message: string, statusCode?: number) {
    super(message)
    this.name = "TranslateProviderError"
    this.providerId = providerId
    this.statusCode = statusCode
  }
}

export async function googleTranslate(
  sourceText: string,
  fromLang: string,
  toLang: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  // Google's free `gtx` client supports `auto` directly via `sl=auto`.
  const params = new URLSearchParams({
    client: "gtx",
    sl: fromLang,
    tl: toLang,
    dt: "t",
    strip: "1",
    nonced: "1",
    q: sourceText,
  })

  const resp = await fetchImpl(`${GOOGLE_BASE}?${params.toString()}`, { method: "GET" })
    .catch((cause) => {
      throw new TranslateProviderError("google", `network error: ${(cause as Error).message}`)
    })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "")
    throw new TranslateProviderError(
      "google",
      `request failed: ${resp.status} ${resp.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
      resp.status,
    )
  }

  let raw: unknown
  try {
    raw = await resp.json()
  } catch (cause) {
    throw new TranslateProviderError("google", `invalid JSON: ${(cause as Error).message}`)
  }

  if (!Array.isArray(raw) || !Array.isArray(raw[0])) {
    throw new TranslateProviderError("google", "unexpected response shape")
  }

  // Each chunk is `[translatedSegment, originalSegment, ...]`. Concatenate
  // all `translatedSegment`s; filter out non-string sentinel rows.
  const parts: string[] = []
  for (const chunk of raw[0]) {
    if (Array.isArray(chunk) && typeof chunk[0] === "string") parts.push(chunk[0])
  }
  return parts.join("")
}

export async function microsoftTranslate(
  sourceText: string,
  fromLang: string,
  toLang: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  // Microsoft requires `from=""` for auto-detect rather than `from=auto`.
  const effectiveFrom = fromLang === "auto" ? "" : fromLang

  const token = await refreshMicrosoftToken(fetchImpl)

  const url = `${MICROSOFT_TRANSLATE_BASE}?from=${encodeURIComponent(effectiveFrom)}&to=${encodeURIComponent(toLang)}&api-version=3.0&textType=plain`
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": token,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify([{ Text: sourceText }]),
  }).catch((cause) => {
    throw new TranslateProviderError("microsoft", `network error: ${(cause as Error).message}`)
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "")
    throw new TranslateProviderError(
      "microsoft",
      `request failed: ${resp.status} ${resp.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
      resp.status,
    )
  }

  let raw: unknown
  try {
    raw = await resp.json()
  } catch (cause) {
    throw new TranslateProviderError("microsoft", `invalid JSON: ${(cause as Error).message}`)
  }

  if (!Array.isArray(raw)) throw new TranslateProviderError("microsoft", "unexpected response shape")
  const first = raw[0] as { translations?: Array<{ text?: string }> } | undefined
  const translated = first?.translations?.[0]?.text
  if (typeof translated !== "string") {
    throw new TranslateProviderError("microsoft", "missing translation text in response")
  }
  return translated
}

async function refreshMicrosoftToken(fetchImpl: typeof fetch): Promise<string> {
  const resp = await fetchImpl(MICROSOFT_AUTH_URL).catch((cause) => {
    throw new TranslateProviderError(
      "microsoft",
      `auth network error: ${(cause as Error).message}`,
    )
  })
  if (!resp.ok) {
    throw new TranslateProviderError(
      "microsoft",
      `auth failed: ${resp.status} ${resp.statusText}`,
      resp.status,
    )
  }
  return resp.text()
}
