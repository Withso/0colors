/**
 * Community API — frontend client for the Railway backend's community routes.
 *
 * All published projects are stored on the Railway backend.
 * Thumbnails are sent as base64 WebP data URLs.
 */

import { SERVER_BASE } from './supabase/client';
import { publicAnonKey } from './supabase/info';
import type { ProjectSnapshot } from './supabase/cloud-sync';

// ── Types ──

export interface CommunityPublishPayload {
  projectId: string;
  title: string;
  description: string;
  allowRemix: boolean;
  snapshot: ProjectSnapshot;
  thumbnailDataUrl?: string; // base64 WebP
}

export interface CommunityProjectMeta {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  allowRemix: boolean;
  thumbnailUrl: string | null;
  userName: string;
  userId: string;
  publishedAt: string;
  updatedAt: string;
  nodeCount: number;
  tokenCount: number;
}

export interface CommunityProjectDetail extends CommunityProjectMeta {
  snapshot: ProjectSnapshot;
}

// ── Helpers ──

function headers(accessToken?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${publicAnonKey}`,
  };
  if (accessToken) {
    h['X-User-Token'] = accessToken;
  }
  return h;
}

// ── API Functions ──

/** Publish a project to the community. Requires auth. */
export async function publishProject(
  payload: CommunityPublishPayload,
  accessToken: string,
): Promise<{ slug: string } | { error: string }> {
  try {
    const res = await fetch(`${SERVER_BASE}/community/publish`, {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || `Server error ${res.status}` };
    return data;
  } catch (err: any) {
    console.error('[Community] Publish failed:', err);
    return { error: err.message || 'Network error' };
  }
}

/** Update publish settings (title, description, allowRemix). Requires auth. */
export async function updatePublishSettings(
  projectId: string,
  updates: { title?: string; description?: string; allowRemix?: boolean; thumbnailDataUrl?: string; snapshot?: ProjectSnapshot },
  accessToken: string,
): Promise<{ ok: boolean } | { error: string }> {
  try {
    const res = await fetch(`${SERVER_BASE}/community/${projectId}`, {
      method: 'PUT',
      headers: headers(accessToken),
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || `Server error ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    console.error('[Community] Update failed:', err);
    return { error: err.message || 'Network error' };
  }
}

/** Unpublish a project from the community. Requires auth. */
export async function unpublishProject(
  projectId: string,
  accessToken: string,
): Promise<{ ok: boolean } | { error: string }> {
  try {
    const res = await fetch(`${SERVER_BASE}/community/${projectId}`, {
      method: 'DELETE',
      headers: headers(accessToken),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || `Server error ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    console.error('[Community] Unpublish failed:', err);
    return { error: err.message || 'Network error' };
  }
}

/** Fetch all community projects (public — no auth needed). */
export async function fetchCommunityProjects(): Promise<CommunityProjectMeta[]> {
  try {
    const res = await fetch(`${SERVER_BASE}/community`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    if (!res.ok) {
      console.error('[Community] Fetch list failed:', res.status);
      return [];
    }
    const data = await res.json();
    return data.projects || [];
  } catch (err) {
    console.error('[Community] Fetch list error:', err);
    return [];
  }
}

/** Fetch a single community project with its full snapshot (public). */
export async function fetchCommunityProject(
  slug: string,
): Promise<CommunityProjectDetail | null> {
  try {
    const res = await fetch(`${SERVER_BASE}/community/project/${slug}`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    if (!res.ok) {
      console.error('[Community] Fetch project failed:', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[Community] Fetch project error:', err);
    return null;
  }
}

/** Check if a specific project is published. Requires auth. */
export async function getPublishStatus(
  projectId: string,
  accessToken: string,
): Promise<CommunityProjectMeta | null> {
  try {
    const res = await fetch(`${SERVER_BASE}/community/status/${projectId}`, {
      headers: headers(accessToken),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
