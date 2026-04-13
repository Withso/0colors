/**
 * useAuthBridge — Syncs ZerosAuthProvider session into the Zustand store.
 *
 * ZerosAuthProvider (from @0zerosdesign/auth-client) handles all auth lifecycle:
 *   - Session restore from localStorage
 *   - Token refresh via Supabase SDK
 *   - Auto sign-out on expired sessions
 *   - SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED events
 *
 * This bridge:
 *   1. Maps ZerosSession → Zustand authSession (for cloud sync, UI, etc.)
 *   2. Maps loading → authChecking
 *   3. Fetches isTemplateAdmin from the 0colors backend (not in shared auth)
 *   4. Provides redirectToZerosLogin for the sign-in button
 *
 * Call this hook ONCE in AppShell.
 */

import { useEffect, useRef } from 'react';
import { useZerosAuth } from '@0zerosdesign/auth-client/react';
import { useStore } from '../store';
import { updateAccessToken, destroyCloudSync } from '../utils/supabase/cloud-sync';

export function useAuthBridge() {
  const { session, user, loading, isAuthenticated, signOut, redirectToLogin } = useZerosAuth();
  const setAuthSession = useStore(s => s.setAuthSession);
  const setAuthChecking = useStore(s => s.setAuthChecking);
  const prevTokenRef = useRef<string | null>(null);

  // Sync auth state to Zustand store
  useEffect(() => {
    // Map loading → authChecking
    setAuthChecking(loading);

    if (session && isAuthenticated) {
      const newToken = session.accessToken;

      // Restore isTemplateAdmin from localStorage cache (set by getCloudMeta)
      let cachedIsTemplateAdmin = false;
      try { cachedIsTemplateAdmin = localStorage.getItem('0colors-isTemplateAdmin') === 'true'; } catch {}

      setAuthSession(prev => ({
        accessToken: newToken,
        userId: session.userId,
        email: session.email,
        name: session.name,
        isAdmin: session.isAdmin || user?.isAdmin,
        isTemplateAdmin: prev?.isTemplateAdmin || cachedIsTemplateAdmin,
      }));

      // Update cloud-sync module's token if it changed
      if (newToken !== prevTokenRef.current) {
        updateAccessToken(newToken);
        prevTokenRef.current = newToken;
      }
    } else if (!loading) {
      // Not authenticated and not loading — clear auth state
      if (prevTokenRef.current) {
        setAuthSession(null);
        updateAccessToken(null);
        destroyCloudSync();
        prevTokenRef.current = null;
      }
    }
  }, [session, user, loading, isAuthenticated]);

  return {
    isAuthenticated,
    signOut,
    redirectToLogin,
  };
}
