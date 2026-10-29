import { defineConfig, devices } from "@playwright/test";

/**
 * Levis' performance suite (README.md beside this file): startup, huge
 * documents with pictures, memory over time, the bundle, and the real
 * app's process memory. It measures and reports; budgets fail it only with
 * PERF_STRICT=1. Kept out of the e2e suite and CI: a full run takes long.
 */
const port = Number(process.env.PLAYWRIGHT_PORT) || 1460;

export default defineConfig({
  testDir: ".",
  testMatch: "*.perf.ts",
  outputDir: "../../test-results/levis-perf-run",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30 * 60_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
    launchOptions: {
      // A 10M-character document needs more than V8's default old space.
      args: ["--js-flags=--max-old-space-size=8192"],
    },
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    cwd: "../..",
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
