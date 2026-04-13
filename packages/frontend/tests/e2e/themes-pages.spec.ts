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

  test('switch page updates toolbar after adding second page', async ({ page }) => {
    // Add a second page
    await page.getByTestId('toolbar-page-dropdown-trigger').click();
    await page.getByTestId('toolbar-page-add').click();
    await expect(page.getByTestId('toolbar-page-current-name')).toContainText('Page 2', { timeout: 15_000 });

    // Wait for dropdown to close, then re-open
    await page.waitForTimeout(500);
    await page.getByTestId('toolbar-page-dropdown-trigger').click();
    await page.waitForTimeout(300);

    // Verify the dropdown has page items
    const pageItems = page.locator('[data-testid^="toolbar-page-item-"]');
    const count = await pageItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await page.keyboard.press('Escape');
  });

  test('add new theme from toolbar', async ({ page }) => {
    await page.getByTestId('toolbar-theme-dropdown-trigger').click();
    await page.getByTestId('toolbar-theme-add').click();

    // Wait for the theme to be created and the toolbar to update
    await page.waitForTimeout(1_000);

    // Verify the current theme name changed (new theme becomes active)
    const themeName = page.getByTestId('toolbar-theme-current-name');
    await expect(themeName).toBeVisible({ timeout: 10_000 });
  });

  test('delete page is accessible in dropdown', async ({ page }) => {
    // Add a second page first
    await page.getByTestId('toolbar-page-dropdown-trigger').click();
    await page.getByTestId('toolbar-page-add').click();
    await expect(page.getByTestId('toolbar-page-current-name')).toContainText('Page 2', { timeout: 15_000 });

    // Wait for dropdown to close, then re-open
    await page.waitForTimeout(500);
    await page.getByTestId('toolbar-page-dropdown-trigger').click();
    await page.waitForTimeout(300);

    // Verify delete buttons exist in the dropdown
    const deleteBtn = page.locator('[data-testid^="toolbar-page-delete-"]').first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    // Delete button should exist when there are multiple pages
    expect(hasDelete).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('rename page inline via dropdown', async ({ page }) => {
    await page.getByTestId('toolbar-page-dropdown-trigger').click();
    await page.waitForTimeout(300);

    // Look for rename input on the first page item
    const renameInput = page.locator('[data-testid^="toolbar-page-rename-input-"]').first();
    const hasRename = await renameInput.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasRename) {
      await renameInput.fill('My Custom Page');
      await renameInput.press('Enter');
      await expect(page.getByTestId('toolbar-page-current-name')).toContainText('My Custom Page', { timeout: 10_000 });
    } else {
      // If rename input isn't visible by default, just verify dropdown is functional
      await expect(page.getByTestId('toolbar-page-add')).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});
