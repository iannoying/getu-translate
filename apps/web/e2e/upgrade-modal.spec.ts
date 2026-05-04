import { expect, test } from "@playwright/test"

const VARIANTS = [
  { source: "free_quota_exceeded", title: "Monthly limit reached" },
  { source: "pro_model_clicked", title: "Pro model — upgrade to unlock" },
  { source: "pdf_quota_exceeded", title: "PDF limit reached" },
  { source: "char_limit_exceeded", title: "Character limit reached" },
  { source: "history_cleanup_warning", title: "History limit reached" },
] as const

test.describe("upgrade modal", () => {
  for (const variant of VARIANTS) {
    test(`opens ${variant.source}`, async ({ page }) => {
      await page.goto("/e2e/upgrade-modal/")

      await page.getByRole("button", { name: `Open ${variant.source}` }).click()

      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await expect(page.getByRole("heading", { name: variant.title })).toBeVisible()
      await expect(dialog.getByRole("table", { name: "Free vs Pro" })).toBeVisible()

      await dialog.getByRole("button", { name: "Close" }).click()
      await expect(dialog).toBeHidden()
    })
  }
})
