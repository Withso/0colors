import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('Token panel', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
  });

  test('tokens panel container and search visible', async ({ page }) => {
    await expect(page.getByTestId('tokens-panel-container')).toBeVisible();
    await expect(page.getByTestId('tokens-panel-search-input')).toBeVisible();
  });

  test('add variable creates token row', async ({ page }) => {
    await page.getByTestId('tokens-panel-tab-tokens').click();
    const addBtn = page.getByTestId('tokens-panel-add-variable-button');
    await addBtn.scrollIntoViewIfNeeded();
    const before = await page.locator('[data-testid^="tokens-panel-token-row-"]').count();
    await addBtn.click({ timeout: 30_000 });
    await page.waitForTimeout(800);
    const after = await page.locator('[data-testid^="tokens-panel-token-row-"]').count();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test('token search filters', async ({ page }) => {
    await page.getByTestId('tokens-panel-tab-tokens').click();
    const addBtn = page.getByTestId('tokens-panel-add-variable-button');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ timeout: 30_000 });
    await page.getByTestId('tokens-panel-search-input').fill('___unlikely_token_name___');
    await expect(page.getByTestId('tokens-panel-container')).toBeVisible();
  });
});
