import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

let _client: SupabaseClient | null = null;

/**
 * Resilient fetch wrapper used by the Supabase client.
 * - Adds a 15-second timeout via AbortController to prevent hanging requests
 *   (common during edge-function cold starts).
 * - Logs network errors for debugging.
 */
const SUPABASE_FETCH_TIMEOUT_MS = 15_000;

function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  // If the caller already provides a signal, listen for its abort too
  if (init?.signal) {
    // If already aborted, abort immediately
    if (init.signal.aborted) {
      controller.abort(init.signal.reason);
    } else {
      init.signal.addEventListener('abort', () => controller.abort(init.signal!.reason), { once: true });
    }
  }
  const timeout = setTimeout(() => controller.abort('Supabase fetch timeout'), SUPABASE_FETCH_TIMEOUT_MS);

  return fetch(input, { ...init, signal: controller.signal })
    .catch((err) => {
      console.log(`[Supabase fetch error] ${err?.message || err} — URL: ${typeof input === 'string' ? input : (input as Request).url}`);
      // Return a synthetic error Response instead of re-throwing.
      // This prevents unhandled rejections from leaking through the Supabase SDK's
      // internal error handling (which doesn't always catch thrown fetch errors).
      // The SDK will parse the 503 body and surface a normal AuthApiError / PostgrestError.
      return new Response(
        JSON.stringify({
          message: err?.message || 'Network request failed',
          error: 'network_error',
          error_description: 'The server could not be reached. This is usually temporary.',
        }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' },
        },
      );
    })
    .finally(() => clearTimeout(timeout));
}

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(supabaseUrl, publicAnonKey, {
      auth: {
        autoRefreshToken: true, // SDK auto-refreshes; no-op lock below prevents Strict Mode double-mount conflicts
        persistSession: true,
        // We handle URL hash tokens manually via useOAuthCallback() in App.tsx.
        // detectSessionInUrl is disabled because Supabase's auto-detection fails
        // silently and causes race conditions (same pattern as 0research).
        detectSessionInUrl: false,
        // Use a stable storage key so double-mount in React Strict Mode
        // doesn't create competing lock scopes.
        storageKey: `sb-${projectId}-auth-token`,
        // Disable the Web Locks API for the auth client.  The SDK's
        // default navigator.locks usage causes "Lock not released within
        // 5 000 ms" errors when React Strict Mode double-mounts the app
        // and two concurrent getSession/refreshSession calls fight for
        // the same lock.  Because we already serialise auth access on the
        // application side (single getSupabaseClient singleton + abort
        // guard in the session-check effect), a simple no-op lock is
        // safe and silences the warnings entirely.
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
          // Execute the critical section directly — no lock contention.
          return await fn();
        },
      },
      global: {
        fetch: resilientFetch,
      },
    });
  }
  return _client;
}

// Server base URL for API calls — reads from env var, falls back to sensible defaults
export const SERVER_BASE = import.meta.env.VITE_API_BASE_URL
    || (import.meta.env.DEV ? 'http://localhost:4455/api' : 'https://api-server-production-0064.up.railway.app/api');