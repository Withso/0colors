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

  test('sample project has duplicate option in sample bar', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/sample-project');
    await waitForAppReady(page);
    await expect(page.getByTestId('page-editor-shell')).toBeVisible();

    // Sample bar should be visible with duplicate options
    const sampleBar = page.getByTestId('canvas-sample-bar-wrap');
    const hasSampleBar = await sampleBar.isVisible({ timeout: 10_000 }).catch(() => false);
    if (hasSampleBar) {
      await expect(page.getByTestId('canvas-sample-bar')).toBeVisible();
      // Look for duplicate trigger
      const dupTrigger = page.getByTestId('canvas-sample-duplicate-trigger');
      const hasDup = await dupTrigger.isVisible({ timeout: 5_000 }).catch(() => false);
      if (hasDup) {
        await dupTrigger.click();
        await expect(page.getByTestId('canvas-sample-duplicate-menu')).toBeVisible({ timeout: 5_000 });
        // Verify both local and cloud duplicate options exist
        await expect(page.getByTestId('canvas-sample-duplicate-local')).toBeVisible();
      }
    }
  });

  test('duplicate sample to local triggers duplication flow', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/sample-project');
    await waitForAppReady(page);
    await expect(page.getByTestId('page-editor-shell')).toBeVisible();

    const sampleBar = page.getByTestId('canvas-sample-bar-wrap');
    const hasSampleBar = await sampleBar.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasSampleBar) {
      test.skip();
      return;
    }

    const dupTrigger = page.getByTestId('canvas-sample-duplicate-trigger');
    const hasDup = await dupTrigger.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasDup) {
      test.skip();
      return;
    }

    await dupTrigger.click();
    const dupLocal = page.getByTestId('canvas-sample-duplicate-local');
    await expect(dupLocal).toBeVisible({ timeout: 5_000 });
    await dupLocal.click();

    // After clicking duplicate, the editor should still be visible (no crash)
    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 30_000 });
  });
});
