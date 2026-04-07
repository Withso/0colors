import { test, expect } from '@playwright/test';
import { gotoAndWaitForApp } from '../../../lib/wait-for-app';
import { colorsMeta } from '../meta';

test.describe('0colors — smoke', () => {
  test('home route responds', async ({ page }) => {
    const res = await page.request.get('/');
    expect(res.ok()).toBeTruthy();
  });

  test('SPA loads without uncaught page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });
    expect(pageErrors, pageErrors.join(' | ')).toHaveLength(0);
  });
});
