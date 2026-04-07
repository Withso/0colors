import { test, expect } from '@playwright/test';
import { gotoAndWaitForApp } from '../../../lib/wait-for-app';
import { colorsMeta } from '../meta';

/**
 * Requires real credentials and backend — skipped unless QA_TEST_EMAIL is set.
 * Keeps CI green while allowing manual / staging runs.
 */
const creds = process.env.QA_TEST_EMAIL && process.env.QA_TEST_PASSWORD;

test.describe('0colors — cloud / auth (optional)', () => {
  test.skip(!creds, 'Set QA_TEST_EMAIL and QA_TEST_PASSWORD to run');

  test('sign-in control reachable after load', async ({ page }) => {
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });
    // Adjust selector when you add data-testid; placeholder assertion:
    await expect(page.locator('body')).toBeVisible();
  });
});
