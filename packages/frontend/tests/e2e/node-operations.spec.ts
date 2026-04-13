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

  test('add RGB root node from toolbar', async ({ page }) => {
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-rgb').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('add OKLCH root node from toolbar', async ({ page }) => {
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-oklch').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('add HCT root node from toolbar', async ({ page }) => {
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hct').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('add second HSL node after first', async ({ page }) => {
    const initial = await page.locator('[data-testid^="canvas-node-card-"]').count();

    // Add first node
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hsl').click();
    await expect(page.locator('[data-testid^="canvas-node-card-"]')).toHaveCount(initial + 1, { timeout: 15_000 });

    // Wait for menu to close fully before re-opening
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(500);

    // Add second node
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hsl').click();

    // Should have 2 more than we started with
    await expect(page.locator('[data-testid^="canvas-node-card-"]')).toHaveCount(initial + 2, { timeout: 15_000 });
  });
});
