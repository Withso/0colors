// ============================================================================
// useAuthBridge — bridges the local /api/auth endpoints into the Zustand store.
//
// On mount:
//   1. GET /api/auth/setup-status. If the install hasn't been set up yet,
//      navigate to /setup (which renders SetupScreen outside the AppShell).
//   2. GET /api/auth/me. If we have a valid session, populate authSession.
//      Otherwise navigate to /login.
//
// Returns the signOut / redirectToLogin helpers that the rest of AppShell
// already expects to consume.
//
// Phase 1's no-op stub used a placeholder admin. That global default is gone
// in Phase 2 — the store's authSession starts null and is only filled in once
// /api/auth/me confirms a valid session cookie.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useStore } from '../store';
import { getMe, getSetupStatus, logout as logoutApi } from '../api/auth';

const AUTH_FREE_PREFIXES = ['/setup', '/login', '/signup', '/accept-invite'];

function isAuthFreePath(pathname: string): boolean {
  return AUTH_FREE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function useAuthBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthSession = useStore((s) => s.setAuthSession);
  const setAuthChecking = useStore((s) => s.setAuthChecking);
  const authSession = useStore((s) => s.authSession);
  const didBootstrap = useRef(false);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    let cancelled = false;
    (async () => {
      setAuthChecking(true);
      try {
        const status = await getSetupStatus().catch(() => ({ isSetupComplete: true }));
        if (!status.isSetupComplete) {
          if (!cancelled && !isAuthFreePath(location.pathname)) {
            navigate('/setup', { replace: true });
          }
          return;
        }

        const user = await getMe();
        if (cancelled) return;

        if (user) {
          setAuthSession({
            accessToken: '',
            userId: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
            isTemplateAdmin: user.isAdmin,
          });
        } else if (!isAuthFreePath(location.pathname)) {
          navigate('/login', { replace: true });
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const signOut = async () => {
    await logoutApi();
    setAuthSession(null);
    navigate('/login', { replace: true });
  };

  const redirectToLogin = () => {
    navigate('/login');
  };

  return {
    isAuthenticated: !!authSession,
    signOut,
    redirectToLogin,
  };
}
