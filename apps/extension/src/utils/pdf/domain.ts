/**
 * Sentinel hostname used for local file:// URLs, which have no real hostname.
 * Kept lowercase so it can be compared directly against `extractDomain` output
 * without re-normalisation.
 */
export const FILE_PROTOCOL_DOMAIN = "file://local"

/**
 * Extract a canonical lowercase hostname from a navigation URL.
 *
 * - `https://a.b.com/x.pdf`        → `"a.b.com"`
 * - `https://A.COM/x.pdf`          → `"a.com"`          (hostnames are lowercased)
 * - `file:///tmp/x.pdf`            → `"file://local"`   (sentinel — no real hostname)
 * - Unparseable input / empty host → `""`
 *
 * Pure, side-effect-free — safe to call from unit tests without a browser.
 */
export function extractDomain(url: string): string {
  if (!url)
    return ""

  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return ""
  }

  if (parsed.protocol === "file:")
    return FILE_PROTOCOL_DOMAIN

  return parsed.hostname.toLowerCase()
}
