import { GETU_DOMAIN, LOCALHOST_DOMAIN, WEBSITE_CADDY_DEV_URL, WEBSITE_PROD_URL } from "@getu/definitions"

export const OFFICIAL_SITE_URL_PATTERNS = [
  `https://*.${GETU_DOMAIN}/*`,
  `http://${LOCALHOST_DOMAIN}/*`,
  `https://${LOCALHOST_DOMAIN}/*`,
]

export const WEBSITE_URL = (import.meta.env.DEV && import.meta.env.WXT_USE_LOCAL_PACKAGES === "true")
  ? WEBSITE_CADDY_DEV_URL
  : WEBSITE_PROD_URL

// API origin: the better-auth/oRPC worker is deployed at `api.<root>` (separate
// from the CF Pages static site at WEBSITE_URL). In dev the Caddy-unified origin
// serves both on the same port, so keep WEBSITE_URL for localhost.
function deriveApiUrl(website: string): string {
  const url = new URL(website)
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return website
  }
  const host = url.hostname.startsWith("www.") ? url.hostname.slice(4) : url.hostname
  return `${url.protocol}//api.${host}`
}

export const API_URL = deriveApiUrl(WEBSITE_URL)

// Public web page where users translate PDFs by uploading. Replaces the
// in-extension PDF translation feature — the popup forwards the active tab's
// PDF URL as `?src=<encoded>` so the page can show the user where they came
// from. The website does not auto-fetch the URL; the user still uploads.
export const WEB_DOCUMENT_TRANSLATE_URL = `${WEBSITE_URL}/document/`
