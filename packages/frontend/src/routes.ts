import { createBrowserRouter } from 'react-router';

/**
 * Router configuration for 0colors.
 *
 * Auth routes (/setup, /login, /accept-invite/:token) render their own
 * full-screen page and deliberately bypass AppShell so the useAuthBridge
 * effect doesn't try to redirect during sign-in. Everything else renders
 * AppShell, which gates on the session and redirects to /login or /setup
 * if needed.
 */
const lazyAppShell = async () => {
  const { AppShell } = await import('./App');
  return { Component: AppShell, HydrateFallback: () => null };
};

const lazyAuthScreen = (name: 'SetupScreen' | 'LoginScreen' | 'SignupScreen' | 'AcceptInviteScreen') => async () => {
  const mod = await import('./pages/AuthScreens');
  return { Component: mod[name], HydrateFallback: () => null };
};

export const router = createBrowserRouter([
  // ── Auth routes (no AppShell) ──
  { path: '/setup', lazy: lazyAuthScreen('SetupScreen') },
  { path: '/login', lazy: lazyAuthScreen('LoginScreen') },
  { path: '/signup', lazy: lazyAuthScreen('SignupScreen') },
  { path: '/accept-invite/:token', lazy: lazyAuthScreen('AcceptInviteScreen') },

  // ── App routes (AppShell) ──
  { path: '/', lazy: lazyAppShell },
  { path: '/projects', lazy: lazyAppShell },
  { path: '/community', lazy: lazyAppShell },
  { path: '/community/:slug', lazy: lazyAppShell },
  { path: '/settings', lazy: lazyAppShell },
  { path: '/profile', lazy: lazyAppShell },
  { path: '/admin', lazy: lazyAppShell },
  { path: '/project/:slug', lazy: lazyAppShell },
  { path: '/project/:slug/code', lazy: lazyAppShell },
  { path: '/project/:slug/export', lazy: lazyAppShell },

  // ── Catch-all fallback ──
  { path: '*', lazy: lazyAppShell },
]);
