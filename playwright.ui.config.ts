import { defineConfig } from '@playwright/test';

// UI-only checks intercept every API request; no database or API server is used.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['account-experience.spec.ts', 'ux-regressions.spec.ts'],
  workers: 1,
  use: { baseURL: 'http://localhost:8081', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm --filter client exec expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
