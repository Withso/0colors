import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

function seriousViolationsOnly(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
}

function summarizeSerious(violations: Awaited<ReturnType<typeof seriousViolationsOnly>>['violations']) {
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join('\n');
}

test.describe('Accessibility smoke', () => {
  test('projects dashboard has no serious or critical accessibility violations', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/projects');
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });

    const results = await seriousViolationsOnly(page);
    const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(summarizeSerious(severe)).toBe('');
  });

  test('advanced popup has no serious or critical accessibility violations in its visible state', async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('canvas-bottom-add-node-trigger').click();
    await page.getByTestId('canvas-bottom-add-node-hsl').click();

    const nodeCard = page.locator('[data-testid^="canvas-node-card-"]').first();
    await expect(nodeCard).toBeVisible({ timeout: 15_000 });
    await nodeCard.click();

    const openAdvanced = page.locator('[data-testid^="canvas-node-advanced-open-"]').first();
    await openAdvanced.click();
    const popup = page.locator('[data-testid^="advanced-popup-panel-"]').first();
    await expect(popup).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page })
      .include('[data-testid^="advanced-popup-panel-"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(summarizeSerious(severe)).toBe('');
  });
});
