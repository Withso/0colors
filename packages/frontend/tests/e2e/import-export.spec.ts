import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('Import / export entry points', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('projects page exposes import', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
    await expect(page.getByTestId('projects-import-button')).toBeVisible();
  });

  test('code preview has copy and download', async ({ page }) => {
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('toolbar-view-code').click();
    await expect(page.getByTestId('code-preview-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('code-preview-copy-button')).toBeVisible();
    await expect(page.getByTestId('code-preview-download-button')).toBeVisible();
  });

  test('code preview format dropdown is functional', async ({ page }) => {
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('toolbar-view-code').click();
    await expect(page.getByTestId('code-preview-page')).toBeVisible({ timeout: 15_000 });

    // Format dropdown should be visible and clickable
    const formatTrigger = page.getByTestId('code-preview-format-dropdown-trigger');
    await expect(formatTrigger).toBeVisible();
    await formatTrigger.click();

    // Some format options should appear — just verify the dropdown opens without error
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  });

  test('switching back to canvas view from code view works', async ({ page }) => {
    await openEditorWithNewLocalProject(page);

    // Switch to code view
    await page.getByTestId('toolbar-view-code').click();
    await expect(page.getByTestId('code-preview-page')).toBeVisible({ timeout: 15_000 });

    // Switch back to canvas view
    await page.getByTestId('toolbar-view-canvas').click();
    await expect(page.getByTestId('canvas-area-container')).toBeVisible({ timeout: 15_000 });
  });
});
