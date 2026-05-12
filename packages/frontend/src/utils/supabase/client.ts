// ============================================================================
// API base URL shim.
//
// Historically this file also exported a Supabase client (`getSupabaseClient`).
// Supabase is gone — only the SERVER_BASE export remains, and only so that
// existing import paths keep resolving. New code should import SERVER_BASE
// directly without going through this module's legacy supabase/ path.
// ============================================================================

// Same-origin in production (backend serves the SPA in Phase 3); Vite proxy
// forwards /api to the backend in dev. Override with VITE_API_BASE_URL only
// when running the frontend on a different origin than the backend.
export const SERVER_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
