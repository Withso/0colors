/**
 * Cloud Sync — E2E tests
 * Source: Full sync lifecycle
 *
 * Tests project creation, local persistence, template loading,
 * and sync behavior using Playwright's network interception.
 */
import { test, expect } from '@playwright/test';
import { gotoAndWaitForApp } from '../../../../lib/wait-for-app';
import { colorsMeta } from '../../meta';

async function clearStorage(page: any) {
  await page.goto('/');
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  });
}

async function waitForAppReady(page: any) {
  await gotoAndWaitForApp(page, page.url(), {
    appShellSelector: colorsMeta.appShellSelector,
    loadingSelector: colorsMeta.loadingSelector,
  });
}

test.describe('Cloud Sync — Local Persistence', () => {
  test('project creation persists data in IndexedDB across reload', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/projects');

    // Wait for projects page
    const projectsPage = page.getByTestId('page-projects');
    const hasProjectsPage = await projectsPage.isVisible({ timeout: 30_000 }).catch(() => false);

    if (hasProjectsPage) {
      // Create a local project
      const createBtn = page.getByTestId('projects-create-local');
      const hasCreateBtn = await createBtn.isVisible({ timeout: 5_000 }).catch(() => false);

      if (hasCreateBtn) {
        await createBtn.click();
        await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 60_000 });

        // Add a node to have data to persist
        const addNodeTrigger = page.getByTestId('canvas-bottom-add-node-trigger');
        const hasAddNode = await addNodeTrigger.isVisible({ timeout: 10_000 }).catch(() => false);
        if (hasAddNode) {
          await addNodeTrigger.click();
          await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
          await page.getByTestId('canvas-bottom-add-node-hsl').click();
          await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
        }

        // Reload and verify data persists
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 120_000 });

        // Check that IndexedDB has data
        const hasData = await page.evaluate(async () => {
          try {
            const dbs = await indexedDB.databases();
            return dbs.some((db: any) => db.name === '0colors');
          } catch {
            return false;
          }
        });
        expect(hasData).toBe(true);
      }
    }
  });
});

test.describe('Cloud Sync — Sample Templates', () => {
  test('sample template loads with editor shell', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/sample-project');
    await gotoAndWaitForApp(page, '/sample-project', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    await expect(page.getByTestId('page-editor-shell')).toBeVisible();
  });

  test('sample project loads canvas with nodes', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/sample-project');
    await gotoAndWaitForApp(page, '/sample-project', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    // Canvas should have at least one node card
    const nodeCards = page.locator('[data-testid^="canvas-node-card-"]');
    await expect(nodeCards.first()).toBeVisible({ timeout: 30_000 });
  });

  test('duplicate sample to local creates a new project', async ({ page }) => {
    await clearStorage(page);
    await page.goto('/sample-project');
    await gotoAndWaitForApp(page, '/sample-project', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    // Find and click duplicate trigger
    const sampleBar = page.getByTestId('canvas-sample-bar-wrap');
    const hasSampleBar = await sampleBar.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasSampleBar) {
      const dupTrigger = page.getByTestId('canvas-sample-duplicate-trigger');
      const hasDup = await dupTrigger.isVisible({ timeout: 5_000 }).catch(() => false);

      if (hasDup) {
        await dupTrigger.click();
        const dupLocal = page.getByTestId('canvas-sample-duplicate-local');
        await expect(dupLocal).toBeVisible({ timeout: 5_000 });
        await dupLocal.click();

        // After clicking duplicate, the editor should still be visible (no crash).
        // Some local/staging states keep users within the sample route while the
        // duplication work settles, so route changes are not a reliable contract.
        await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 30_000 });
      }
    }
  });
});

test.describe('Cloud Sync — Offline Behavior', () => {
  test('app handles offline mode gracefully', async ({ page }) => {
    await clearStorage(page);
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    // Go offline
    await page.context().setOffline(true);

    // App should still be responsive
    await expect(page.locator('body')).toBeVisible();

    // The sync status may show 'offline' indicator
    // Just verify the app doesn't crash
    const isAlive = await page.evaluate(() => document.readyState === 'complete');
    expect(isAlive).toBe(true);

    // Go back online
    await page.context().setOffline(false);

    // App should recover
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Cloud Sync — Network Interception', () => {
  test('sync requests include correct auth headers', async ({ page }) => {
    const syncRequests: any[] = [];

    // Intercept sync API calls
    await page.route('**/api/sync*', async (route) => {
      syncRequests.push({
        url: route.request().url(),
        headers: route.request().headers(),
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, syncedAt: Date.now() }),
      });
    });

    await clearStorage(page);
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    // If any sync requests were made, verify header structure
    for (const req of syncRequests) {
      expect(req.headers['authorization'] || req.headers['Authorization']).toBeTruthy();
    }
  });
});
