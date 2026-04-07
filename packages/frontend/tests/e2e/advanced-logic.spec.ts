import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('Advanced logic', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
  });

  test('save and reopen a simple hue expression from the advanced popup', async ({ page }) => {
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('canvas-bottom-add-node-hsl').click();

    const nodeCard = page.locator('[data-testid^="canvas-node-card-"]').first();
    await expect(nodeCard).toBeVisible({ timeout: 15_000 });
    await nodeCard.click();

    const openAdvanced = page.locator('[data-testid^="canvas-node-advanced-open-"]').first();
    await expect(openAdvanced).toBeVisible({ timeout: 10_000 });
    await openAdvanced.click();

    const popup = page.locator('[data-testid^="advanced-popup-panel-"]').first();
    await expect(popup).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('advanced-add-condition-hue').click();
    const input = page.getByTestId('advanced-row-hue-0-input').first();
    await input.fill('15');
    await input.press('Enter');
    await page.getByTestId('advanced-popup-header').click();

    await expect(page.getByTestId('advanced-final-output-value-hue')).toContainText('15');
    await page.getByTestId('advanced-channel-save-hue').click();
    await page.getByTestId('advanced-popup-close-button').click();

    await expect(openAdvanced).toBeVisible();
    await openAdvanced.click();
    await expect(page.getByTestId('advanced-final-output-value-hue')).toContainText('15');
  });
});
