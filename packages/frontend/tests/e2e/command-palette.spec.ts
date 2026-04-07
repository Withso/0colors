import { test, expect } from '@playwright/test';
import { clearStorage, modKey, openEditorWithNewLocalProject } from './helpers';

test.describe('Command palette', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
  });

  test('open via bottom bar and close with Escape', async ({ page }) => {
    await page.getByTestId('command-palette-open-button').click();
    await expect(page.getByTestId('command-palette-backdrop')).toBeVisible();
    await expect(page.getByTestId('command-palette-search-input')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette-backdrop')).toHaveCount(0);
  });

  test('open via keyboard shortcut', async ({ page }) => {
    await page.keyboard.press(`${modKey()}+KeyK`);
    await expect(page.getByTestId('command-palette-search-input')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('search filters results area', async ({ page }) => {
    await page.getByTestId('command-palette-open-button').click();
    await page.getByTestId('command-palette-search-input').fill('zzzznomatchxyz');
    await expect(page.getByTestId('command-palette-results')).toContainText(/no results/i);
  });
});
