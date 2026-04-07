import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('Themes and pages', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
  });

  test('page dropdown opens', async ({ page }) => {
    await page.getByTestId('toolbar-page-dropdown-trigger').click();
    await expect(page.getByTestId('toolbar-page-add')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
  });

  test('theme dropdown opens', async ({ page }) => {
    await page.getByTestId('toolbar-theme-dropdown-trigger').click();
    await expect(page.getByTestId('toolbar-theme-add')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
  });

  test('add new page from toolbar', async ({ page }) => {
    await expect(page.getByTestId('toolbar-page-current-name')).toContainText('Page 1');
    await page.getByTestId('toolbar-page-dropdown-trigger').click();
    await page.getByTestId('toolbar-page-add').click();
    await expect(page.getByTestId('toolbar-page-current-name')).toContainText('Page 2', { timeout: 15_000 });
  });
});
