// ============================================
// MODULE: Supabase client re-export shim
//
// 0colors used to maintain its own Supabase client here (with a resilient
// fetch wrapper and a no-op lock). Those hardenings now live in
// `@0zerosdesign/auth-client`, and the entire app shares a single
// singleton from that package. This file is kept as a thin shim so the
// many `SERVER_BASE` imports don't need to churn, and the historical
// `getSupabaseClient()` name keeps working.
// ============================================

import { getSupabase } from '@0zerosdesign/auth-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseClient(): SupabaseClient {
  return getSupabase();
}

// Server base URL for API calls — reads from env var, falls back to sensible
// defaults. Not auth-related; kept here for historical import paths.
export const SERVER_BASE = import.meta.env.VITE_API_BASE_URL
    || (import.meta.env.DEV ? 'http://localhost:4455/api' : 'https://api-server-production-0064.up.railway.app/api');
