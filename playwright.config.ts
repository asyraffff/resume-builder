import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: real browser, real production build, AI responses replayed from fixtures (tests/e2e/fixtures.ts)
 * so runs are fast, free and repeatable. Runs on port 3200 so it doesn't clash with `npm run dev`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 1000 } } }],
  webServer: {
    command: "npm run build && npx next start -p 3200",
    url: "http://localhost:3200",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
