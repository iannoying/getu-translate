import { GETU_DOMAIN, LOCALHOST_DOMAIN, WEBSITE_CADDY_DEV_URL, WEBSITE_PROD_URL } from "@getu/definitions"

export const OFFICIAL_SITE_URL_PATTERNS = [
  `https://*.${GETU_DOMAIN}/*`,
  `http://${LOCALHOST_DOMAIN}/*`,
  `https://${LOCALHOST_DOMAIN}/*`,
]

export const WEBSITE_URL = (import.meta.env.DEV && import.meta.env.WXT_USE_LOCAL_PACKAGES === "true")
  ? WEBSITE_CADDY_DEV_URL
  : WEBSITE_PROD_URL
