import { test, expect } from '@playwright/test';
import { clearStorage, modKey, openEditorWithNewLocalProject } from './helpers';

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
  });

  test('Cmd/Ctrl+K opens command palette', async ({ page }) => {
    await page.keyboard.press(`${modKey()}+KeyK`);
    await expect(page.getByTestId('command-palette-backdrop')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('switch to code view with toolbar', async ({ page }) => {
    await page.getByTestId('toolbar-view-code').click();
    await expect(page.getByTestId('code-preview-page')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('toolbar-view-canvas').click();
    await expect(page.getByTestId('canvas-root')).toBeVisible();
  });

  test('shortcuts panel toggles', async ({ page }) => {
    await page.getByTestId('shortcuts-panel-toggle-button').click();
    await expect(page.getByTestId('shortcuts-panel-container')).toBeVisible();
    await page.getByTestId('shortcuts-panel-close-button').click();
  });
});
