/**
 * Extract the `src` query parameter from a `location.search` string.
 *
 * @param search - A URL query string, typically `location.search` (e.g. `"?src=…"`).
 * @returns The decoded `src` value, or `null` when the parameter is missing or empty.
 */
export function parseSrcParam(search: string): string | null {
  const params = new URLSearchParams(search)
  return params.get("src") || null
}
