import { expect, type Page } from '@playwright/test';

export async function clearStorage(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

/** Editor (project open) or projects dashboard. */
export async function waitForAppReady(page: Page, timeout = 120_000): Promise<void> {
  const editor = page.getByTestId('page-editor-shell');
  const projects = page.getByTestId('page-projects');
  const tmpl = page.getByTestId('app-loading-templates');
  const auth = page.getByTestId('app-loading-auth');
  if (await tmpl.isVisible().catch(() => false)) {
    await tmpl.waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
  if (await auth.isVisible().catch(() => false)) {
    await auth.waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
  await editor.or(projects).waitFor({ state: 'visible', timeout });
}

export function modKey(): 'Meta' | 'Control' {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

/** From dashboard: create a new local project and wait for the real editor (not sample). */
export async function openEditorWithNewLocalProject(page: Page): Promise<void> {
  await page.goto('/projects');
  await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
  await page.getByTestId('projects-create-local').click();
  await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/sample-project(\/|$)/);
}
