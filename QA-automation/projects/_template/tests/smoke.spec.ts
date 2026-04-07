import { test, expect } from '@playwright/test';
import { gotoAndWaitForApp } from '../../../lib/wait-for-app';
import { templateMeta } from '../meta';

test.describe('template — smoke', () => {
  test('customize selectors in ../meta.ts and register project in playwright.config.ts', async ({
    page,
  }) => {
    test.skip(true, 'Template only — duplicate folder and enable');
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: templateMeta.appShellSelector,
      loadingSelector: templateMeta.loadingSelector,
    });
    await expect(page.locator('body')).toBeVisible();
  });
});
