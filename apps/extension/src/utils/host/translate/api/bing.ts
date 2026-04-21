export interface BingInput { text: string, from: string, to: string }
export interface BingOutput { text: string }

interface TokenCache {
  ig: string
  iid: string
  key: string
  token: string
  fetchedAt: number
}

export interface BingOptions {
  now?: () => number
}

const TOKEN_TTL = 30 * 60_000
const defaultNow = () => Date.now()

let _tokenCache: TokenCache | null = null

export function resetTokenCacheForTesting(): void {
  _tokenCache = null
}

async function fetchToken(now: () => number): Promise<TokenCache> {
  if (_tokenCache && now() - _tokenCache.fetchedAt < TOKEN_TTL)
    return _tokenCache

  const res = await fetch("https://www.bing.com/translator")
  if (!res.ok)
    throw new Error(`Bing translator page HTTP ${res.status}`)

  const html = await res.text()
  const ig = html.match(/IG:"([^"]+)"/)?.[1]
  const iid = html.match(/_G\.IID="([^"]+)"/)?.[1]
  const params = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)"/)

  if (!ig || !iid || !params)
    throw new Error("Bing translator IG/IID/key not found")

  _tokenCache = { ig, iid, key: params[1], token: params[2], fetchedAt: now() }
  return _tokenCache
}

export async function translateBing(input: BingInput, opts?: BingOptions): Promise<BingOutput> {
  const now = opts?.now ?? defaultNow
  const t = await fetchToken(now)
  const url = `https://www.bing.com/ttranslatev3?isVertical=1&IG=${t.ig}&IID=${t.iid}`
  const body = new URLSearchParams({
    fromLang: input.from,
    to: input.to,
    text: input.text,
    key: t.key,
    token: t.token,
  })

  const res = await fetch(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  })

  if (!res.ok)
    throw new Error(`Bing translate HTTP ${res.status}`)

  const data = await res.json() as Array<{ translations: Array<{ text: string }> }>
  const text = data?.[0]?.translations?.[0]?.text
  if (text == null)
    throw new Error("Bing translate: unexpected response format")

  return { text }
}
