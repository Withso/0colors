import { test, expect } from '@playwright/test';
import { clearStorage, waitForAppReady } from './helpers';

test.describe('App loading and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('loads without uncaught page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await waitForAppReady(page);
    expect(errors, errors.join('; ')).toHaveLength(0);
  });

  test('home resolves to editor or projects dashboard', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const editor = page.getByTestId('page-editor-shell');
    const projects = page.getByTestId('page-projects');
    await expect(editor.or(projects)).toBeVisible();
  });

  test('/projects shows projects page', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
    await expect(page.getByTestId('projects-list-container')).toBeVisible();
  });

  test('/sample-project shows editor shell', async ({ page }) => {
    await page.goto('/sample-project');
    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 120_000 });
    await expect(page.getByTestId('toolbar-container')).toBeVisible();
  });

  test('browser back navigation does not blank screen', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
    await page.goto('/sample-project');
    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 120_000 });
    await page.goBack();
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 60_000 });
    await expect(page.getByTestId('page-projects')).toBeVisible();
  });

  test('forward navigation after back preserves state', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
    await page.goto('/sample-project');
    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 120_000 });
    await page.goBack();
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 60_000 });
    await page.goForward();
    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 60_000 });
    await expect(page.getByTestId('page-editor-shell')).toBeVisible();
  });

  test('unknown route does not crash the application', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/nonexistent-route-xyz');
    await waitForAppReady(page);
    // Should redirect to projects or editor, not crash
    const editor = page.getByTestId('page-editor-shell');
    const projects = page.getByTestId('page-projects');
    await expect(editor.or(projects)).toBeVisible({ timeout: 30_000 });
    expect(errors, errors.join('; ')).toHaveLength(0);
  });
});
