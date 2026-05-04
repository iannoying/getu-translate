import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "NEXT_PUBLIC_E2E=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8788 pnpm exec next dev --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000/e2e/upgrade-modal/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
