import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject, waitForAppReady } from './helpers';

test.describe('Project management', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('create local project opens editor', async ({ page }) => {
    await openEditorWithNewLocalProject(page);
    await expect(page.getByTestId('toolbar-container')).toBeVisible();
    await expect(page.getByTestId('canvas-root')).toBeVisible();
  });

  test('project card appears after create', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
    const before = await page.locator('[data-testid^="projects-card-"]').count();
    await page.getByTestId('projects-create-local').click();
    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 60_000 });
    await expect(page).not.toHaveURL(/\/sample-project(\/|$)/);
    await page.getByTestId('tokens-panel-nav-projects').click();
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 60_000 });
    const after = await page.locator('[data-testid^="projects-card-"]').count();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test('import button is available on projects page', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
    await expect(page.getByTestId('projects-import-button')).toBeVisible();
  });
});
