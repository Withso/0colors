// ============================================================================
// Admin API client. All endpoints require an admin session (verified server-
// side); the frontend gates the corresponding UI on isAdmin.
// ============================================================================

import { SERVER_BASE } from '../utils/supabase/client';

export type AdminUserStatus = 'active' | 'pending' | 'deactivated';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isActive: boolean;
  status: AdminUserStatus;
  inviteExpiresAt: string | null;
  invitedBy: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AdminSettings {
  allow_public_signup?: boolean;
  instance_name?: string;
  attribution_enabled?: boolean;
  branding_favicon?: { data: string; contentType: string };
  branding_logo?: { data: string; contentType: string };
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SERVER_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function jsonOrThrow<T>(res: Response, fallbackMsg: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || fallbackMsg);
  return data as T;
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listAdminUsers(): Promise<AdminUser[]> {
  const res = await adminFetch('/admin/users');
  const data = await jsonOrThrow<{ users: AdminUser[] }>(res, 'Failed to load users');
  return data.users;
}

export async function updateAdminUser(id: string, patch: { isAdmin?: boolean; isActive?: boolean }): Promise<void> {
  const res = await adminFetch(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  await jsonOrThrow(res, 'Failed to update user');
}

export async function deleteAdminUser(id: string, transferTo?: string): Promise<void> {
  const qs = transferTo ? `?transferTo=${encodeURIComponent(transferTo)}` : '';
  const res = await adminFetch(`/admin/users/${encodeURIComponent(id)}${qs}`, { method: 'DELETE' });
  await jsonOrThrow(res, 'Failed to delete user');
}

export async function resendInviteForUser(id: string): Promise<{ inviteToken: string; expiresAt: string }> {
  const res = await adminFetch(`/admin/users/${encodeURIComponent(id)}/resend-invite`, { method: 'POST' });
  return jsonOrThrow(res, 'Failed to regenerate invite');
}

export async function generateResetLinkForUser(id: string): Promise<{ inviteToken: string; expiresAt: string }> {
  const res = await adminFetch(`/admin/users/${encodeURIComponent(id)}/reset-link`, { method: 'POST' });
  return jsonOrThrow(res, 'Failed to generate reset link');
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getAdminSettings(): Promise<AdminSettings> {
  const res = await adminFetch('/admin/settings');
  const data = await jsonOrThrow<{ settings: AdminSettings }>(res, 'Failed to load settings');
  return data.settings ?? {};
}

export async function patchAdminSettings(patch: Partial<AdminSettings>): Promise<void> {
  const res = await adminFetch('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  await jsonOrThrow(res, 'Failed to update settings');
}

// ── Public (unauthenticated) settings ────────────────────────────────────────

export interface PublicSettings {
  instanceName: string;
  attributionEnabled: boolean;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const res = await fetch(`${SERVER_BASE}/public-settings`, { credentials: 'include' });
  if (!res.ok) return { instanceName: '0colors', attributionEnabled: true };
  return res.json();
}
