import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('Undo / redo', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
  });

  test('undo removes last node after add', async ({ page }) => {
    const initial = await page.locator('[data-testid^="canvas-node-card-"]').count();
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hsl').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]')).toHaveCount(initial + 1, { timeout: 20_000 });
    const undo = page.getByTestId('canvas-undo-button');
    await expect(undo).toBeEnabled({ timeout: 15_000 });
    await undo.click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-testid^="canvas-node-card-"]')).toHaveCount(initial);
  });

  test('redo restores after undo', async ({ page }) => {
    const initial = await page.locator('[data-testid^="canvas-node-card-"]').count();
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hsl').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]')).toHaveCount(initial + 1, { timeout: 20_000 });
    await expect(page.getByTestId('canvas-undo-button')).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId('canvas-undo-button').click();
    await page.waitForTimeout(600);
    const redo = page.getByTestId('canvas-redo-button');
    await expect(redo).toBeEnabled({ timeout: 15_000 });
    await redo.click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]')).toHaveCount(initial + 1, { timeout: 15_000 });
  });
});
