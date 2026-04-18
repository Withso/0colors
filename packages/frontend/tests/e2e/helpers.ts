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

/**
 * Create a new project and land in the editor.
 *
 * Strategy: open the default sample project, duplicate it to local/cloud,
 * which creates a real editable project. This works regardless of auth state
 * since sample projects are always accessible.
 */
export async function openEditorWithNewLocalProject(page: Page): Promise<void> {
  await page.goto('/sample-project');
  await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 120_000 });

  // Click the duplicate trigger in the sample bar
  const dupTrigger = page.getByTestId('canvas-sample-duplicate-trigger');
  await dupTrigger.waitFor({ state: 'visible', timeout: 15_000 });
  await dupTrigger.click();

  // Pick "Duplicate to local" (or the first available duplicate option)
  const dupLocal = page.getByTestId('canvas-sample-duplicate-local');
  const dupCloud = page.getByTestId('canvas-sample-duplicate-cloud');
  const localVisible = await dupLocal.isVisible({ timeout: 5_000 }).catch(() => false);
  if (localVisible) {
    await dupLocal.click();
  } else {
    // Authenticated user may only see cloud duplicate
    await dupCloud.waitFor({ state: 'visible', timeout: 5_000 });
    await dupCloud.click();
  }

  // Wait for the new project editor — the sample bar should disappear
  // after duplication (the project is no longer a sample)
  await page.getByTestId('page-editor-shell').waitFor({ state: 'visible', timeout: 60_000 });

  // The sample bar disappearing is the reliable signal that duplication succeeded
  await page.getByTestId('canvas-sample-bar-wrap').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
}
