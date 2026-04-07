import type { Page } from '@playwright/test';

export type GotoAppOptions = {
  appShellSelector?: string;
  timeoutMs?: number;
  loadingSelector?: string;
};

export async function gotoAndWaitForApp(
  page: Page,
  path: string = '/',
  opts: GotoAppOptions = {},
): Promise<void> {
  const shell = opts.appShellSelector ?? '.app-shell';
  const timeout = opts.timeoutMs ?? 90_000;
  const loading = opts.loadingSelector ?? '.app-shell-loading';

  await page.goto(path, { waitUntil: 'domcontentloaded', timeout });

  const loadingLocator = page.locator(loading).first();
  try {
    await loadingLocator.waitFor({ state: 'visible', timeout: 5_000 });
    await loadingLocator.waitFor({ state: 'hidden', timeout: timeout - 5_000 });
  } catch {
    // overlay absent or fast path
  }

  await page.locator(shell).first().waitFor({ state: 'visible', timeout });
}
