const BILIBILI_BV_PATH_PATTERN = /\/video\/(BV[a-z0-9]+)/i
const BILIBILI_AV_PATH_PATTERN = /\/video\/av(\d+)/i

/**
 * Extract the current Bilibili video identifier from `window.location`.
 *
 * Bilibili has two legacy + current identifier formats:
 * - Preferred: `BVxxxxxx` (new, base58-style, since 2020) - e.g. /video/BV1GJ411x7h7
 * - Legacy:   `avNNNNNN` (numeric) - e.g. /video/av170001
 *
 * Returns `BV...` or `av...` (lowercase `av` prefix preserved) so the fetcher
 * can pass the right query param (`bvid=` vs `aid=`) to Bilibili's API.
 */
export function getBilibiliVideoId(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const bvMatch = window.location.pathname.match(BILIBILI_BV_PATH_PATTERN)
  if (bvMatch) {
    return bvMatch[1]
  }

  const avMatch = window.location.pathname.match(BILIBILI_AV_PATH_PATTERN)
  if (avMatch) {
    return `av${avMatch[1]}`
  }

  return null
}
