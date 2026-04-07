import { test, expect } from '@playwright/test';
import { gotoAndWaitForApp } from '../../../lib/wait-for-app';
import { pressChord } from '../../../lib/keyboard';
import { colorsMeta } from '../meta';

test.describe('0colors — command palette', () => {
  test('Cmd/Ctrl+K opens palette with search input', async ({ page }) => {
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });
    await pressChord(page, 'KeyK');
    await expect(page.locator(colorsMeta.commandPaletteBackdrop)).toBeVisible();
    await expect(page.locator(colorsMeta.commandPaletteInput)).toBeVisible();
    await expect(page.locator(colorsMeta.commandPaletteInput)).toHaveAttribute(
      'placeholder',
      /Search nodes/i,
    );
  });

  test('Escape closes palette', async ({ page }) => {
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });
    await pressChord(page, 'KeyK');
    await expect(page.locator(colorsMeta.commandPaletteBackdrop)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(colorsMeta.commandPaletteBackdrop)).toHaveCount(0);
  });
});
