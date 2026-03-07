import { createBrowserRouter } from 'react-router';

/**
 * Minimal router configuration for 0colors.
 *
 * Uses a single catch-all route that renders the AppShell — the monolithic
 * state container — and lets it decide what to render based on the pathname.
 * Lazy import avoids a circular dependency (App.tsx imports this file).
 */
export const router = createBrowserRouter([
  {
    path: '*',
    lazy: async () => {
      const { AppShell } = await import('./App');
      return { Component: AppShell };
    },
    HydrateFallback: () => null,
  },
]);