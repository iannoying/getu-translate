// @vitest-environment jsdom
/**
 * Tests for the Pro-gated "Download bilingual PDF" button (M3 PR#C Task 3).
 *
 * Strategy:
 *   - Mock `exportBilingualPdf` so tests don't touch pdf-lib / fetch; we
 *     just assert the button invokes it with the right props.
 *   - Mock `URL.createObjectURL` / `revokeObjectURL` (absent in jsdom) plus
 *     `HTMLAnchorElement.click` so we can observe the download trigger
 *     without navigating.
 *   - Hydrate the shared `entitlementsAtom` through a per-test Jotai store
 *     so we can toggle Free ↔ Pro cleanly.
 */
import type { Entitlements } from "@/types/entitlements"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { deriveFilename, ExportButton } from "../export-button"

// Mock the exporter so tests don't perform real network / pdf-lib work.
const exportBilingualPdfMock = vi.fn()
vi.mock("../../export/pdf-lib-writer", () => ({
  exportBilingualPdf: (opts: unknown) => exportBilingualPdfMock(opts),
}))

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "pdf_translate_export"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const PRO_WITHOUT_EXPORT: Entitlements = {
  tier: "pro",
  features: ["pdf_translate"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const PROPS = {
  fileHash: "hash-abc",
  src: "https://example.com/papers/thesis.pdf",
  targetLang: "zh-CN",
  providerId: "openai",
} as const

function renderWithEntitlements(entitlements: Entitlements) {
  const store = createStore()
  store.set(entitlementsAtom, entitlements)
  return render(
    <JotaiProvider store={store}>
      <ExportButton {...PROPS} />
    </JotaiProvider>,
  )
}

describe("exportButton", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>
  let createObjectUrlSpy: ReturnType<typeof vi.fn>
  let revokeObjectUrlSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    exportBilingualPdfMock.mockReset()

    // jsdom doesn't implement object URLs; stub them.
    createObjectUrlSpy = vi.fn(() => "blob:mock-url")
    revokeObjectUrlSpy = vi.fn()
    // @ts-expect-error — jsdom URL doesn't declare these.
    URL.createObjectURL = createObjectUrlSpy
    // @ts-expect-error — jsdom URL doesn't declare these.
    URL.revokeObjectURL = revokeObjectUrlSpy

    // `a.click()` attempts navigation in jsdom; suppress it.
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {})
  })

  afterEach(() => {
    clickSpy.mockRestore()
  })

  it("renders disabled for a Free user without the export feature", () => {
    renderWithEntitlements(FREE_ENTITLEMENTS)
    const btn = screen.getByTestId("pdf-export-button")
    expect(btn).toBeDisabled()
    expect(btn.getAttribute("data-export-enabled")).toBe("false")
    expect(btn).toHaveAttribute("title", "Pro feature — upgrade to download")
  })

  it("renders disabled for a Pro user without the pdf_translate_export feature", () => {
    renderWithEntitlements(PRO_WITHOUT_EXPORT)
    const btn = screen.getByTestId("pdf-export-button")
    expect(btn).toBeDisabled()
    expect(btn.getAttribute("data-export-enabled")).toBe("false")
  })

  it("renders enabled for a Pro user with the pdf_translate_export feature", () => {
    renderWithEntitlements(PRO_ENTITLEMENTS)
    const btn = screen.getByTestId("pdf-export-button")
    expect(btn).not.toBeDisabled()
    expect(btn.getAttribute("data-export-enabled")).toBe("true")
    expect(btn).toHaveAttribute("title", "Download bilingual PDF")
  })

  it("no-ops when a Free user clicks (exporter not called)", async () => {
    renderWithEntitlements(FREE_ENTITLEMENTS)
    fireEvent.click(screen.getByTestId("pdf-export-button"))
    // Allow any async chain a chance to fire before asserting absence.
    await Promise.resolve()
    expect(exportBilingualPdfMock).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it("calls exportBilingualPdf and triggers a download when a Pro user clicks", async () => {
    const blob = new Blob(["pdf-bytes"], { type: "application/pdf" })
    exportBilingualPdfMock.mockResolvedValue(blob)

    renderWithEntitlements(PRO_ENTITLEMENTS)
    fireEvent.click(screen.getByTestId("pdf-export-button"))

    await waitFor(() => {
      expect(exportBilingualPdfMock).toHaveBeenCalledTimes(1)
    })
    expect(exportBilingualPdfMock).toHaveBeenCalledWith({
      fileHash: PROPS.fileHash,
      src: PROPS.src,
      targetLang: PROPS.targetLang,
      providerId: PROPS.providerId,
    })

    // Download was triggered via an anchor click; object URL was created + revoked.
    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })
    expect(createObjectUrlSpy).toHaveBeenCalledWith(blob)
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:mock-url")
  })

  it("shows a busy state during export and re-enables afterwards", async () => {
    let resolveExport: ((v: Blob) => void) | undefined
    const pending = new Promise<Blob>((res) => {
      resolveExport = res
    })
    exportBilingualPdfMock.mockReturnValue(pending)

    renderWithEntitlements(PRO_ENTITLEMENTS)
    const btn = screen.getByTestId("pdf-export-button")
    fireEvent.click(btn)

    // While the exporter promise is pending, button reports busy.
    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-busy", "true")
    })
    expect(btn).toBeDisabled()
    expect(btn.textContent).toMatch(/exporting/i)

    resolveExport!(new Blob(["x"], { type: "application/pdf" }))

    // Once resolved the button returns to enabled/idle.
    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-busy", "false")
    })
    expect(btn).not.toBeDisabled()
  })

  it("ignores a second click while already busy (double-click guard)", async () => {
    let resolveExport: ((v: Blob) => void) | undefined
    const pending = new Promise<Blob>((res) => {
      resolveExport = res
    })
    exportBilingualPdfMock.mockReturnValue(pending)

    renderWithEntitlements(PRO_ENTITLEMENTS)
    const btn = screen.getByTestId("pdf-export-button")
    fireEvent.click(btn)

    // Wait until the busy flag is observably set so the second click
    // definitely sees the guard, not a stale pre-setBusy render.
    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-busy", "true")
    })

    // Second click must not enqueue another export. `disabled` blocks the
    // DOM click, but we also guard inside `handleClick` for defence in
    // depth — the assertion covers both layers.
    fireEvent.click(btn)
    await Promise.resolve()
    expect(exportBilingualPdfMock).toHaveBeenCalledTimes(1)

    // Clean up the pending promise so the busy state settles.
    resolveExport!(new Blob(["x"], { type: "application/pdf" }))
    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-busy", "false")
    })
  })

  it("swallows exporter errors without crashing the button", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    exportBilingualPdfMock.mockRejectedValue(new Error("boom"))

    renderWithEntitlements(PRO_ENTITLEMENTS)
    const btn = screen.getByTestId("pdf-export-button")
    fireEvent.click(btn)

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled()
    })
    // Button re-enables so the user can retry.
    await waitFor(() => {
      expect(btn).not.toBeDisabled()
    })
    expect(clickSpy).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe("deriveFilename", () => {
  it("derives a filename from a typical https PDF URL", () => {
    expect(deriveFilename("https://example.com/papers/thesis.pdf"))
      .toBe("thesis-bilingual.pdf")
  })

  it("strips .PDF case-insensitively", () => {
    expect(deriveFilename("https://example.com/report.PDF"))
      .toBe("report-bilingual.pdf")
  })

  it("handles file:// URLs", () => {
    expect(deriveFilename("file:///Users/me/docs/a.pdf"))
      .toBe("a-bilingual.pdf")
  })

  it("falls back to document when the path has no filename segment", () => {
    expect(deriveFilename("https://example.com/"))
      .toBe("document-bilingual.pdf")
  })

  it("falls back to document for a malformed URL", () => {
    expect(deriveFilename("not a url"))
      .toBe("document-bilingual.pdf")
  })

  it("preserves non-pdf-extensioned filenames (only .pdf is stripped)", () => {
    expect(deriveFilename("https://example.com/slides.deck"))
      .toBe("slides.deck-bilingual.pdf")
  })
})
