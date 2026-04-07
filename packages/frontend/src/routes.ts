import { createBrowserRouter } from 'react-router';

/**
 * Router configuration for 0colors.
 *
 * All routes render AppShell which handles its own view switching internally.
 * This gives React Router proper URL awareness for link generation and
 * navigation, while AppShell retains rendering control during the migration.
 */
const lazyAppShell = async () => {
  const { AppShell } = await import('./App');
  return { Component: AppShell, HydrateFallback: () => null };
};

export const router = createBrowserRouter([
  {
    path: '/',
    lazy: lazyAppShell,
  },
  {
    path: '/projects',
    lazy: lazyAppShell,
  },
  {
    path: '/community',
    lazy: lazyAppShell,
  },
  {
    path: '/community/:slug',
    lazy: lazyAppShell,
  },
  {
    path: '/settings',
    lazy: lazyAppShell,
  },
  {
    path: '/profile',
    lazy: lazyAppShell,
  },
  {
    path: '/sample-project',
    lazy: lazyAppShell,
  },
  {
    path: '/sample-project/:slug',
    lazy: lazyAppShell,
  },
  {
    path: '/project/:slug',
    lazy: lazyAppShell,
  },
  {
    path: '/project/:slug/code',
    lazy: lazyAppShell,
  },
  {
    path: '/project/:slug/export',
    lazy: lazyAppShell,
  },
  {
    // Catch-all fallback
    path: '*',
    lazy: lazyAppShell,
  },
]);
