import { test, expect } from '@playwright/test';
import { gotoAndWaitForApp } from '../../../lib/wait-for-app';
import { colorsMeta } from '../meta';

test.describe('0colors — app shell', () => {
  test('document title and root render', async ({ page }) => {
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });
    await expect(page).toHaveTitle(/0colors/i);
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('main toolbar is visible', async ({ page }) => {
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });
    await expect(page.locator('.app-toolbar').first()).toBeVisible();
  });

  test('canvas view toggle is present', async ({ page }) => {
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });
    await expect(page.locator('.app-toolbar-view-btn').first()).toBeVisible();
  });
});
