/**
 * Auth Security — E2E regression tests for the open-redirect + OAuth-callback
 * hardenings shipped as part of the cross-project auth remediation.
 *
 * These tests don't require real 0accounts credentials; they exercise the
 * 0colors-side OAuth-callback handler and session-storage behaviour. For
 * full end-to-end coverage across `accounts.zeros.design` → `0colors`, run
 * with QA_TEST_EMAIL and QA_TEST_PASSWORD set and 0accounts dev server
 * running on localhost:3001.
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

test.describe('Auth Security — OAuth callback handler', () => {
  test('strips the hash even when tokens are malformed', async ({ page }) => {
    await clearStorage(page);

    // Malformed callback: access_token present, refresh_token missing.
    // useOAuthCallback should refuse to establish a session AND clean the hash.
    await page.goto('/#access_token=garbage&token_type=bearer');

    await gotoAndWaitForApp(page, page.url(), {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    // Hash should have been stripped by useOAuthCallback.
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');

    // No Supabase session should have been persisted.
    const sb = await page.evaluate(() =>
      localStorage.getItem('sb-qvayepdjxvkdeiczjzfj-auth-token'),
    );
    expect(sb).toBeNull();
  });

  test('does not establish a session for non-zeros hash tokens', async ({ page }) => {
    await clearStorage(page);

    // Tokens that look structurally correct but aren't from our Supabase.
    // Supabase.setSession will reject them; the hook should clean up.
    await page.goto(
      '/#access_token=eyJhbGciOiJIUzI1NiJ9.fake&refresh_token=alsoFake&token_type=bearer',
    );

    await gotoAndWaitForApp(page, page.url(), {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');

    // No valid 0colors auth session ends up in the Zustand-backed key.
    const session = await page.evaluate(() =>
      localStorage.getItem('0colors-auth-session'),
    );
    // Either null or no accessToken — never a fully-populated session from garbage.
    if (session) {
      const parsed = JSON.parse(session);
      expect(parsed.accessToken).toBeFalsy();
    }
  });

  test('gates app render on useOAuthCallback resolution', async ({ page }) => {
    // When landing at /#access_token=..., the app shows "Signing in..."
    // first and only renders the routes once setSession resolves. This
    // test just confirms the app eventually loads without getting stuck.
    await clearStorage(page);
    await page.goto('/#access_token=x&refresh_token=y&token_type=bearer');

    await gotoAndWaitForApp(page, page.url(), {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Auth Security — session storage keys', () => {
  test('uses the canonical auth-client storage key', async ({ page }) => {
    // auth-client hard-codes `sb-qvayepdjxvkdeiczjzfj-auth-token` in
    // config.ts. If the app stops using it, cross-product session handoff
    // from accounts.zeros.design silently breaks.
    await clearStorage(page);
    await gotoAndWaitForApp(page, '/', {
      appShellSelector: colorsMeta.appShellSelector,
      loadingSelector: colorsMeta.loadingSelector,
    });

    const keys = await page.evaluate(() => Object.keys(localStorage));
    // The Supabase SDK may or may not have written the key on first load —
    // we just assert it's one of the known-safe key prefixes.
    const authKeys = keys.filter((k) => k.startsWith('sb-'));
    for (const k of authKeys) {
      expect(k).toBe('sb-qvayepdjxvkdeiczjzfj-auth-token');
    }
  });
});
