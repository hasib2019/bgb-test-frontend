import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the REAL stack: a real browser, the real Next.js
 * build, the real Express API, and the real PostgreSQL database. Nothing is
 * mocked.
 *
 * This is the layer the component tests cannot provide. `__tests__/*.test.tsx`
 * mock `api.placeBid`, so they prove the UI reacts correctly to a 409 — but not
 * that a 409 is ever actually produced and delivered end to end.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',

  // Every test shares one database and bids against seeded lots, so they must
  // not run concurrently with each other. (The *application* handles
  // concurrency fine — that is the point — but a test asserting "the price is
  // now X" cannot tolerate another test bidding underneath it.)
  fullyParallel: false,
  workers: 1,

  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run start',
      cwd: '../backend',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Built rather than `next dev`: E2E should exercise the artefact that
      // actually gets deployed.
      command: 'npm run build && npm run start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
