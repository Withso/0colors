// Re-export of API base URL. publicAnonKey re-export was removed when Supabase
// was stripped — call sites either import publicAnonKey from supabase/info
// directly (Phase 1 placeholder) or have been migrated off it.
export { SERVER_BASE } from '../utils/supabase/client';
