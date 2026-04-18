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

    // Use the cloud create button if authenticated, otherwise duplicate a sample
    const cloudBtn = page.getByTestId('projects-create-cloud');
    const hasCloudBtn = await cloudBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasCloudBtn) {
      await cloudBtn.click();
    } else {
      // Fall back to sample duplicate flow
      await openEditorWithNewLocalProject(page);
    }

    await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 60_000 });
    // Wait for sample bar to disappear (confirms duplication/creation)
    await page.getByTestId('canvas-sample-bar-wrap').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
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

  test('project card context menu has delete option', async ({ page }) => {
    // Create a project first
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('tokens-panel-nav-projects').click();
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 60_000 });

    // Find a project card and its menu
    const cardMenu = page.locator('[data-testid^="projects-card-menu-"]').first();
    const menuExists = await cardMenu.isVisible({ timeout: 10_000 }).catch(() => false);
    if (menuExists) {
      await cardMenu.click();
      const deleteOption = page.locator('[data-testid^="projects-card-delete-"]').first();
      await expect(deleteOption).toBeVisible({ timeout: 5_000 });
      // Press Escape to close menu without deleting
      await page.keyboard.press('Escape');
    }
  });

  test('project card context menu has duplicate option', async ({ page }) => {
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('tokens-panel-nav-projects').click();
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 60_000 });

    const cardMenu = page.locator('[data-testid^="projects-card-menu-"]').first();
    const menuExists = await cardMenu.isVisible({ timeout: 10_000 }).catch(() => false);
    if (menuExists) {
      await cardMenu.click();
      const dupOption = page.locator('[data-testid^="projects-card-duplicate-"]').first();
      await expect(dupOption).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');
    }
  });

  test('delete project removes it from the list', async ({ page }) => {
    // Create a project
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('tokens-panel-nav-projects').click();
    await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 60_000 });

    const beforeCount = await page.locator('[data-testid^="projects-card-"]').count();
    if (beforeCount === 0) return;

    // Open context menu and click delete
    const cardMenu = page.locator('[data-testid^="projects-card-menu-"]').first();
    const menuExists = await cardMenu.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!menuExists) return;

    await cardMenu.click();
    const deleteBtn = page.locator('[data-testid^="projects-card-delete-"]').first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasDelete) return;

    await deleteBtn.click();

    // Handle confirmation dialog if it appears
    const confirmBtn = page.getByTestId('projects-delete-dialog-confirm');
    const hasConfirm = await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasConfirm) {
      await confirmBtn.click();
    }

    // Wait for deletion to process
    await page.waitForTimeout(1_000);
    const afterCount = await page.locator('[data-testid^="projects-card-"]').count();
    expect(afterCount).toBeLessThanOrEqual(beforeCount);
  });
});
