import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_TEST = "1";
process.env.OLOAD_SESSION_SECRET = process.env.OLOAD_SESSION_SECRET ?? "playwright-session-secret";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3101";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(skipWebServer ? {} : {
    webServer: {
      command: "cmd /c \"npm run build && set HOSTNAME=127.0.0.1&& set PORT=3101&& node scripts/run-standalone-server.mjs\"",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  }),
});