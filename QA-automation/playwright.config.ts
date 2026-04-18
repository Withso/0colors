import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const repoRoot = path.resolve(__dirname, '..');
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1';
const shouldEmitJson = !process.argv.includes('--list') && !process.argv.includes('--ui');
const jsonOutput =
  process.env.QA_PLAYWRIGHT_REPORT_FILE ||
  path.join(__dirname, 'reports/scratch', `playwright-${process.pid}.json`);

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/html' }],
    ...(shouldEmitJson ? ([['json', { outputFile: jsonOutput }]] as const) : []),
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
      testDir: './projects/0colors/tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL,
      },
    },
    {
      name: '0colors-smoke',
      testDir: './projects/0colors/tests',
      testMatch: /\.(spec|test)\.(ts|tsx)$/,
      testIgnore: ['**/unit/**', '**/domain/**', '**/integration/**', '**/helpers/**', '**/e2e/**'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL,
      },
    },
  ],
});
