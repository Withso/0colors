import { test, expect } from '@playwright/test';
import { clearStorage, waitForAppReady } from './helpers';

test.describe('Sample templates', () => {
  test('sample route loads editor shell', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/sample-project');
    await waitForAppReady(page);
    await expect(page.getByTestId('page-editor-shell')).toBeVisible();
    await expect(page.getByTestId('toolbar-container')).toBeVisible();
  });
});
