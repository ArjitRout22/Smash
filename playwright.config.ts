import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Requires a running app + a migrated, seeded database.
 * First time only: `npx playwright install chromium`.
 *
 * The webServer below boots `next dev` (NODE_ENV=development), so OTP codes are
 * returned in the API response and auto-filled by the login page — letting the
 * e2e test complete the passwordless flow without a real SMS provider.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
