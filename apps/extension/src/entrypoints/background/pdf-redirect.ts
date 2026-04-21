import { browser } from "#imports"
import { logger } from "@/utils/logger"
import { ensureInitializedConfig } from "./config"

export type PdfRedirectDecision
  = | { action: "redirect", viewerUrl: string }
    | { action: "skip" }

export interface DecideRedirectParams {
  targetUrl: string
  activationMode: "ask" | "always" | "manual"
  enabled: boolean
  /**
   * Blocklist is matched with two rules:
   *   1. Exact hostname match (e.g. `evil.com` matches `evil.com`).
   *   2. Any-depth subdomain match (e.g. `evil.com` also matches `docs.evil.com`,
   *      `a.b.evil.com`, etc. — any number of leading labels).
   * This mirrors how users mentally model "I don't want this site's PDFs taken over".
   * Pattern-style matching (as used by siteControl) is intentionally NOT reused here
   * because the PDF blocklist is written from the first-use toast's "Never" button
   * where the user has no opportunity to write a pattern.
   */
  blocklistDomains: string[]
  allowFileProtocol: boolean
  /** e.g. `chrome-extension://<id>` — pass without trailing slash */
  viewerOrigin: string
}

const VIEWER_PATH = "/pdf-viewer.html"

/**
 * Pure decision function: given a navigation target + current pdfTranslation config,
 * decide whether to redirect to our self-hosted pdf.js viewer.
 *
 * Returns `{ action: "skip" }` when any guard trips; otherwise returns
 * `{ action: "redirect", viewerUrl: <viewerOrigin>/pdf-viewer.html?src=<encoded targetUrl> }`.
 *
 * No side effects, no `browser.*` access — safe to unit-test in isolation.
 */
export function decideRedirect(params: DecideRedirectParams): PdfRedirectDecision {
  const {
    targetUrl,
    activationMode,
    enabled,
    blocklistDomains,
    allowFileProtocol,
    viewerOrigin,
  } = params

  // 1. Feature disabled globally.
  if (!enabled) {
    return { action: "skip" }
  }

  // 2. User chose manual-only — popup button is the only way to activate.
  if (activationMode === "manual") {
    return { action: "skip" }
  }

  // Parse URL once; bail out if it's malformed (e.g. browser-internal about:blank, javascript:, garbage).
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  }
  catch {
    return { action: "skip" }
  }

  // 3. Self-recursion guard: if we're navigating to our own viewer page, do nothing.
  // Without this, the viewer's internal pdf-fetch could re-enter the listener and loop.
  if (
    targetUrl.startsWith(`${viewerOrigin}${VIEWER_PATH}`)
    || (parsed.protocol === "chrome-extension:" && parsed.pathname === VIEWER_PATH)
  ) {
    return { action: "skip" }
  }

  // 4. file:// URLs need the user's explicit opt-in (Chrome's "Allow file URLs" toggle).
  if (parsed.protocol === "file:") {
    if (!allowFileProtocol) {
      return { action: "skip" }
    }
  }
  else if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    // Only http(s) and file: are meaningful navigation targets for PDF.
    return { action: "skip" }
  }

  // 5. Path must end with `.pdf` (case-insensitive). `.pdf` appearing only in query / fragment
  // must NOT trigger redirect — that's just a string, not a PDF document.
  if (!parsed.pathname.toLowerCase().endsWith(".pdf")) {
    return { action: "skip" }
  }

  // 6. Blocklist — exact hostname or any-depth subdomain match.
  // file:// URLs have empty hostname; they bypass this check (governed solely by allowFileProtocol).
  const hostname = parsed.hostname.toLowerCase()
  if (hostname.length > 0) {
    for (const raw of blocklistDomains) {
      const blocked = raw.trim().toLowerCase()
      if (!blocked)
        continue
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        return { action: "skip" }
      }
    }
  }

  // 7. Redirect.
  const viewerUrl = `${viewerOrigin}${VIEWER_PATH}?src=${encodeURIComponent(targetUrl)}`
  return { action: "redirect", viewerUrl }
}

/**
 * Registers a `webNavigation.onBeforeNavigate` listener that redirects top-frame
 * `.pdf` navigations to the bundled viewer. Must be called synchronously inside
 * `defineBackground.main()` so MV3 service-worker wakeups don't lose the listener.
 */
export function setUpPdfRedirect() {
  // Computed once at setup — the extension's own origin never changes at runtime.
  const viewerOrigin = browser.runtime.getURL("").replace(/\/$/, "")

  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // Only intercept the top frame — iframe-embedded PDFs stay with the host page.
    if (details.frameId !== 0)
      return

    try {
      const config = await ensureInitializedConfig()
      if (!config)
        return

      const decision = decideRedirect({
        targetUrl: details.url,
        activationMode: config.pdfTranslation.activationMode,
        enabled: config.pdfTranslation.enabled,
        blocklistDomains: config.pdfTranslation.blocklistDomains,
        allowFileProtocol: config.pdfTranslation.allowFileProtocol,
        viewerOrigin,
      })

      if (decision.action === "redirect") {
        await browser.tabs.update(details.tabId, { url: decision.viewerUrl })
      }
    }
    catch (error) {
      logger.error("[Background][PdfRedirect] Failed to handle navigation", error)
    }
  })
}
