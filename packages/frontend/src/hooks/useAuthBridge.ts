// ============================================================================
// useAuthBridge — Phase 1 stub.
//
// Was: wired ZerosAuthProvider (cloud Supabase session) into the Zustand
// authSession slice. Now: that SDK is gone, so this hook is a no-op shim that
// only exists to keep import paths stable until Phase 2 lands real local auth
// (setup wizard, /login, invites). Phase 2 replaces the body with a fetch
// against a local /api/auth/me endpoint and a real signOut → /api/auth/logout.
// ============================================================================

export function useAuthBridge() {
  return {
    isAuthenticated: true,
    signOut: async () => {
      // Phase 2: POST /api/auth/logout, clear authSession, redirect to /login.
    },
    redirectToLogin: () => {
      // Phase 2: navigate('/login').
    },
  };
}
