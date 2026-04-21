export interface YandexInput { text: string, from: string, to: string }
export interface YandexOutput { text: string }

interface SidCache { sid: string, fetchedAt: number }

let sidCache: SidCache | null = null
const TTL = 30 * 60_000

export function resetSidCacheForTesting(): void {
  sidCache = null
}

async function fetchSid(now: () => number): Promise<string> {
  if (sidCache && now() - sidCache.fetchedAt < TTL)
    return sidCache.sid
  const res = await fetch("https://translate.yandex.com/")
  if (!res.ok)
    throw new Error(`Yandex page HTTP ${res.status}`)
  const html = await res.text()
  const m = html.match(/SID:\s*['"]([^'"]+)['"]/)
  if (!m)
    throw new Error("Yandex SID not found")
  const sid = m[1].split(".").reverse().join(".")
  sidCache = { sid, fetchedAt: now() }
  return sid
}

export async function translateYandex(
  input: YandexInput,
  opts?: { now?: () => number },
): Promise<YandexOutput> {
  const now = opts?.now ?? (() => Date.now())
  const sid = await fetchSid(now)
  const url = `https://translate.yandex.net/api/v1/tr.json/translate?srv=tr-text&id=${sid}-0-0&lang=${input.from}-${input.to}`
  const body = new URLSearchParams({ text: input.text, options: "4" })
  const res = await fetch(url, { method: "POST", body })
  if (!res.ok)
    throw new Error(`Yandex translate HTTP ${res.status}`)
  const data = await res.json() as { code: number, text?: string[], message?: string }
  if (data.code !== 200)
    throw new Error(`Yandex translate error ${data.code}: ${data.message ?? ""}`)
  const text = data.text?.[0]
  if (text == null)
    throw new Error("Yandex translate: unexpected response format")
  return { text }
}
