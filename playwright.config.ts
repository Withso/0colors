import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const shouldEmitJson = !process.argv.includes('--list') && !process.argv.includes('--ui');
const e2eJsonOutput =
  process.env.QA_E2E_REPORT_FILE ||
  path.join(__dirname, 'QA-automation/reports/scratch', `playwright-${process.pid}.json`);

export default defineConfig({
  testDir: path.join(__dirname, 'packages/frontend/tests/e2e'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'QA-automation/reports/html' }],
    ...(shouldEmitJson ? [['json', { outputFile: e2eJsonOutput }]] : []),
  ],
  outputDir: 'QA-automation/test-results/artifacts',
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1'
      ? undefined
      : {
          command: 'npm run dev',
          cwd: __dirname,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 180_000,
        },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
