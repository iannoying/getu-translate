const TED_TALK_PATH_PATTERN = /^\/talks\/([\w-]+)(?:\/|$)/i

/**
 * Extract the current TED talk slug from `window.location`.
 *
 * TED talk URLs look like:
 * - `https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action`
 * - `https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action/transcript`
 *
 * Playlists (`/playlists/...`) and TED Ed (`/ed/...`) are deliberately excluded
 * so this returns `null` on those pages.
 */
export function getTedTalkSlug(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const match = window.location.pathname.match(TED_TALK_PATH_PATTERN)
  return match ? match[1] : null
}
