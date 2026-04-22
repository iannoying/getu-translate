const X_STATUS_PATH_PATTERN = /^\/[^/]+\/status\/(\d+)/

/**
 * Extract the current X / Twitter tweet id from `window.location`.
 *
 * X status URLs look like:
 * - `https://twitter.com/{user}/status/{id}`
 * - `https://x.com/{user}/status/{id}`
 *
 * Timelines (`/home`), search (`/search`), profiles (`/{user}`) and list
 * pages are deliberately excluded so this returns `null` on those pages.
 */
export function getXTweetId(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const match = window.location.pathname.match(X_STATUS_PATH_PATTERN)
  return match ? match[1] : null
}
