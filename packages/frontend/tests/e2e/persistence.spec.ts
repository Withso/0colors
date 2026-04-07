import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('Persistence', () => {
  test('local project survives reload', async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hsl').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 120_000 });
    await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 20_000 });
  });
});
