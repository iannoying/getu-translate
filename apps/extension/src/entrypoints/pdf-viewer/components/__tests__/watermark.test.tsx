// @vitest-environment jsdom
/**
 * Tests for the Free-tier watermark component (M3 PR#C Task 4).
 *
 * Strategy:
 *   - Hydrate `entitlementsAtom` + `hasAnyTranslatedPageAtom` through a
 *     per-test Jotai store so we can toggle Free ↔ Pro and the session-seen
 *     flag cleanly.
 *   - Assert DOM visibility (the component returns `null` for hidden cases,
 *     so `queryByTestId(...) === null` is the signal).
 *   - On click, read `showPdfUpgradeDialogAtom` from the store and assert
 *     `{ open: true, source: "pdf-translation-watermark" }`.
 */
import type { Entitlements } from "@/types/entitlements"
import { fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { describe, expect, it } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { hasAnyTranslatedPageAtom, showPdfUpgradeDialogAtom } from "../../atoms"
import { Watermark } from "../watermark"

const PRO_UNLIMITED: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "pdf_translate_unlimited"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const PRO_EXPORT_ONLY: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "pdf_translate_export"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const PRO_NO_FEATURES: Entitlements = {
  // Covers the defensive third arm of the Pro check: `isPro()` true but
  // neither pdf_translate_unlimited nor pdf_translate_export granted (e.g.
  // an SKU mid-rollout). The watermark must still hide.
  tier: "pro",
  features: ["pdf_translate"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

function renderWatermark(params: {
  entitlements: Entitlements
  hasAnyTranslated: boolean
}) {
  const store = createStore()
  store.set(entitlementsAtom, params.entitlements)
  store.set(hasAnyTranslatedPageAtom, params.hasAnyTranslated)
  const utils = render(
    <JotaiProvider store={store}>
      <Watermark />
    </JotaiProvider>,
  )
  return { ...utils, store }
}

describe("watermark", () => {
  it("hides for Pro user with pdf_translate_unlimited even after translated pages", () => {
    renderWatermark({ entitlements: PRO_UNLIMITED, hasAnyTranslated: true })
    expect(screen.queryByTestId("pdf-watermark")).toBeNull()
  })

  it("hides for Pro user with pdf_translate_export even after translated pages", () => {
    renderWatermark({ entitlements: PRO_EXPORT_ONLY, hasAnyTranslated: true })
    expect(screen.queryByTestId("pdf-watermark")).toBeNull()
  })

  it("hides for Pro user without either paid PDF feature (defensive isPro gate)", () => {
    renderWatermark({ entitlements: PRO_NO_FEATURES, hasAnyTranslated: true })
    expect(screen.queryByTestId("pdf-watermark")).toBeNull()
  })

  it("hides for Free user before any page has been translated", () => {
    renderWatermark({ entitlements: FREE_ENTITLEMENTS, hasAnyTranslated: false })
    expect(screen.queryByTestId("pdf-watermark")).toBeNull()
  })

  it("renders for Free user once at least one page has been translated", () => {
    renderWatermark({ entitlements: FREE_ENTITLEMENTS, hasAnyTranslated: true })
    const btn = screen.getByTestId("pdf-watermark")
    expect(btn).toBeInTheDocument()
    expect(btn.textContent).toMatch(/Translated by GetU.*Upgrade to remove/)
  })

  it("opens the UpgradeDialog with source=pdf-translation-watermark on click", () => {
    const { store } = renderWatermark({
      entitlements: FREE_ENTITLEMENTS,
      hasAnyTranslated: true,
    })

    // Starts closed + default source (daily-limit).
    expect(store.get(showPdfUpgradeDialogAtom)).toEqual({
      open: false,
      source: "pdf-translation-daily-limit",
    })

    fireEvent.click(screen.getByTestId("pdf-watermark"))

    // After click: dialog opens + source is attributed to the watermark.
    expect(store.get(showPdfUpgradeDialogAtom)).toEqual({
      open: true,
      source: "pdf-translation-watermark",
    })
  })
})
