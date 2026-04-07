import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('Node operations', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
  });

  test('add HSL root node from toolbar', async ({ page }) => {
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hsl').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('add palette node', async ({ page }) => {
    await page.getByTestId('canvas-bottom-add-palette-button').click();
    await expect(
      page.locator('[data-testid^="canvas-palette-node-card-"]').first(),
    ).toBeVisible({ timeout: 45_000 });
  });

  test('open token table from toolbar', async ({ page }) => {
    await page.getByTestId('toolbar-token-table-toggle').click();
    await expect(page.getByTestId('token-table-popup-panel')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('token-table-popup-close-button').click();
  });
});
