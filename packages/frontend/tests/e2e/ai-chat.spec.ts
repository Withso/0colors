import { test, expect } from '@playwright/test';
import { clearStorage, openEditorWithNewLocalProject } from './helpers';

test.describe('AI chat', () => {
  test('AI button visible for cloud/template only — local shows toast or no panel', async ({ page }) => {
    await clearStorage(page);
    await openEditorWithNewLocalProject(page);
    await page.getByTestId('ai-chat-toolbar-button').click();
    await expect(page.getByTestId('ai-chat-panel-floating')).toHaveCount(0);
    await expect(page.getByTestId('ai-chat-panel-docked')).toHaveCount(0);
  });
});
