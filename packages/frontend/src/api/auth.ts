// ============================================================================
// Local auth API client.
//
// Thin wrappers around POST /api/auth/* endpoints. All requests use
// `credentials: 'include'` so the session cookie set by the backend is sent
// on subsequent fetches (and so set-cookie on the response actually persists
// in the browser when the frontend is served from a different origin in dev).
// ============================================================================

import { SERVER_BASE } from '../utils/supabase/client';

export { SERVER_BASE } from '../utils/supabase/client';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

interface AuthResponse {
  success?: boolean;
  user?: AuthedUser;
  error?: string;
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SERVER_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

// ── Setup ────────────────────────────────────────────────────────────────────

export async function getSetupStatus(): Promise<{ isSetupComplete: boolean }> {
  const res = await authFetch('/auth/setup-status');
  if (!res.ok) throw new Error(`setup-status failed: ${res.status}`);
  return res.json();
}

export async function setupAdmin(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthedUser> {
  const res = await authFetch('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data: AuthResponse = await res.json().catch(() => ({}));
  if (!res.ok || !data.user) {
    throw new Error(data.error || `Setup failed (${res.status})`);
  }
  return data.user;
}

// ── Login / Logout / Me ──────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthedUser> {
  const res = await authFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data: AuthResponse = await res.json().catch(() => ({}));
  if (!res.ok || !data.user) {
    throw new Error(data.error || 'Login failed');
  }
  return data.user;
}

export async function logout(): Promise<void> {
  await authFetch('/auth/logout', { method: 'POST' }).catch(() => {});
}

export async function getMe(): Promise<AuthedUser | null> {
  const res = await authFetch('/auth/me');
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.user ?? null;
}

// ── Invites ──────────────────────────────────────────────────────────────────

export interface InviteLookup {
  valid: boolean;
  reason?: 'unknown' | 'expired' | 'already-activated';
  email?: string;
  name?: string;
  expiresAt?: string;
}

export async function lookupInvite(token: string): Promise<InviteLookup> {
  const res = await authFetch(`/auth/invite/${encodeURIComponent(token)}`);
  if (!res.ok) return { valid: false, reason: 'unknown' };
  return res.json();
}

export async function acceptInvite(token: string, password: string): Promise<AuthedUser> {
  const res = await authFetch('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  const data: AuthResponse = await res.json().catch(() => ({}));
  if (!res.ok || !data.user) {
    throw new Error(data.error || 'Failed to accept invite');
  }
  return data.user;
}

export async function createInvite(input: {
  email: string;
  name: string;
  isAdmin?: boolean;
}): Promise<{ inviteToken: string; userId: string; expiresAt: string }> {
  const res = await authFetch('/auth/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.inviteToken) {
    throw new Error(data?.error || 'Failed to create invite');
  }
  return { inviteToken: data.inviteToken, userId: data.userId, expiresAt: data.expiresAt };
}
