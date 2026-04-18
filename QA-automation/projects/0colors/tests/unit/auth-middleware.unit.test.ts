/**
 * Backend Auth Middleware — Unit tests
 * Source: packages/backend/src/middleware/auth.ts
 *
 * Tests requireAuth, requireAdmin, isAdmin, isTemplateAdmin, normalizeUserToMeta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockGetAuthUser = vi.fn();
const mockIsUserAdmin = vi.fn();
const mockGetUser = vi.fn();
const mockGetAppSetting = vi.fn();

vi.mock('@backend/auth.js', () => ({
  getAuthUser: (...args: any[]) => mockGetAuthUser(...args),
}));

vi.mock('@backend/db.js', () => ({
  isUserAdmin: (...args: any[]) => mockIsUserAdmin(...args),
  getUser: (...args: any[]) => mockGetUser(...args),
  getAppSetting: (...args: any[]) => mockGetAppSetting(...args),
}));

import { requireAuth, requireAdmin, isAdmin, isTemplateAdmin, getUserRole, normalizeUserToMeta } from '@backend/middleware/auth';

function mockCtx(): any {
  return {
    req: { header: vi.fn() },
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAuth', () => {
  it('returns userId when getAuthUser succeeds', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'u-1' });
    const c = mockCtx();
    const result = await requireAuth(c);
    expect(result).toBe('u-1');
    expect(c.status).not.toHaveBeenCalled();
  });

  it('returns null and sets 401 when getAuthUser returns null', async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const c = mockCtx();
    const result = await requireAuth(c);
    expect(result).toBeNull();
    expect(c.status).toHaveBeenCalledWith(401);
  });
});

describe('isAdmin', () => {
  it('delegates to isUserAdmin and returns true', async () => {
    mockIsUserAdmin.mockResolvedValue(true);
    expect(await isAdmin('u-1')).toBe(true);
    expect(mockIsUserAdmin).toHaveBeenCalledWith('u-1');
  });

  it('returns false for non-admin', async () => {
    mockIsUserAdmin.mockResolvedValue(false);
    expect(await isAdmin('u-2')).toBe(false);
  });
});

describe('isTemplateAdmin', () => {
  it('returns true when user is admin AND matches template_admin_user_id', async () => {
    mockIsUserAdmin.mockResolvedValue(true);
    mockGetAppSetting.mockResolvedValue('"u-1"'); // JSON-quoted in DB
    expect(await isTemplateAdmin('u-1')).toBe(true);
  });

  it('returns false when user is admin but not the template admin', async () => {
    mockIsUserAdmin.mockResolvedValue(true);
    mockGetAppSetting.mockResolvedValue('"u-other"');
    expect(await isTemplateAdmin('u-1')).toBe(false);
  });

  it('returns false when user is not admin (short-circuits)', async () => {
    mockIsUserAdmin.mockResolvedValue(false);
    expect(await isTemplateAdmin('u-1')).toBe(false);
    expect(mockGetAppSetting).not.toHaveBeenCalled();
  });

  it('returns false when template_admin_user_id is null', async () => {
    mockIsUserAdmin.mockResolvedValue(true);
    mockGetAppSetting.mockResolvedValue(null);
    expect(await isTemplateAdmin('u-1')).toBe(false);
  });
});

describe('requireAdmin', () => {
  it('returns userId when user is authenticated and admin', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'u-1' });
    mockIsUserAdmin.mockResolvedValue(true);
    const c = mockCtx();
    expect(await requireAdmin(c)).toBe('u-1');
  });

  it('returns null and sets 403 when user is not admin', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'u-1' });
    mockIsUserAdmin.mockResolvedValue(false);
    const c = mockCtx();
    expect(await requireAdmin(c)).toBeNull();
    expect(c.status).toHaveBeenCalledWith(403);
  });

  it('returns null and sets 401 when not authenticated', async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const c = mockCtx();
    expect(await requireAdmin(c)).toBeNull();
    expect(c.status).toHaveBeenCalledWith(401);
  });
});

describe('getUserRole', () => {
  it('returns "admin" for admin user', async () => {
    mockIsUserAdmin.mockResolvedValue(true);
    expect(await getUserRole('u-1')).toBe('admin');
  });

  it('returns "user" for non-admin user', async () => {
    mockIsUserAdmin.mockResolvedValue(false);
    expect(await getUserRole('u-2')).toBe('user');
  });
});

describe('normalizeUserToMeta', () => {
  it('returns { cloudProjectIds: [] } when user is null', () => {
    expect(normalizeUserToMeta(null)).toEqual({ cloudProjectIds: [] });
  });

  it('maps all user fields correctly', () => {
    const user = {
      email: 'a@b.com',
      name: 'Alice',
      role: 'user',
      created_at: new Date(1000),
      cloud_project_ids: ['p1', 'p2'],
    };
    const meta = normalizeUserToMeta(user);
    expect(meta.email).toBe('a@b.com');
    expect(meta.name).toBe('Alice');
    expect(meta.role).toBe('user');
    expect(meta.createdAt).toBe(1000);
    expect(meta.cloudProjectIds).toEqual(['p1', 'p2']);
  });

  it('passes through numeric created_at without conversion', () => {
    const meta = normalizeUserToMeta({ created_at: 12345, cloud_project_ids: [] });
    expect(meta.createdAt).toBe(12345);
  });

  it('defaults cloudProjectIds to empty array when field missing', () => {
    const meta = normalizeUserToMeta({ email: 'x@y.com' });
    expect(meta.cloudProjectIds).toEqual([]);
  });
});
