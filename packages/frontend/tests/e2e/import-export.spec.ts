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
});
