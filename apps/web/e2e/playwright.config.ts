import { defineConfig, devices } from '@playwright/test';

// lt-42o: Chromium-only smoke tests for the core learner tasks against the Docker stack.
// `npm run e2e` (scripts/run-e2e.mjs) runs them in the compose `e2e` service at http://web:4173;
// LINGOTORTE_E2E_BASE_URL may point at any other already-running stack (see docs/dev/e2e.md).
const baseURL = process.env.LINGOTORTE_E2E_BASE_URL ?? 'http://web:4173';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  globalSetup: './global-setup.ts',
  outputDir: './artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
