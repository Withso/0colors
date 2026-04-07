import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const repoRoot = path.resolve(__dirname, '..');
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1';

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/html' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  outputDir: 'test-results/artifacts',
  webServer: skipWebServer
    ? undefined
    : {
        command: 'npm run dev',
        cwd: repoRoot,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
  projects: [
    {
      name: '0colors',
      testDir: './projects/0colors/tests',
      use: {
        ...devices['Desktop Chrome'],
        baseURL,
      },
    },
  ],
});
