import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/functional",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "on-first-retry",
  },
  webServer: {
    command: "python -m backend.server",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
