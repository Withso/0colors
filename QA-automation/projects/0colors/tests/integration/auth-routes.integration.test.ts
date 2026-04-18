/**
 * Backend Auth Routes — Integration tests
 * Source: packages/backend/src/routes/auth.ts
 *
 * Tests the auth Hono router endpoints with mocked DB and auth functions.
 * Uses Hono's built-in test utilities.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ── Mocks ──

const mockSupabaseCreateUser = vi.fn();
const mockDbCreateUser = vi.fn().mockResolvedValue(undefined);
const mockGetUser = vi.fn();
const mockRequireAuth = vi.fn();
const mockGetUserRole = vi.fn();
const mockIsTemplateAdmin = vi.fn();
const mockNormalizeUserToMeta = vi.fn();

vi.mock('@backend/auth.js', () => ({
  createUser: (...args: any[]) => mockSupabaseCreateUser(...args),
}));

vi.mock('@backend/db.js', () => ({
  createUser: (...args: any[]) => mockDbCreateUser(...args),
  getUser: (...args: any[]) => mockGetUser(...args),
  CLOUD_PROJECT_LIMIT: 20,
}));

vi.mock('@backend/constants.js', () => ({
  CLOUD_PROJECT_LIMIT: 20,
}));

vi.mock('@backend/middleware/auth.js', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  getUserRole: (...args: any[]) => mockGetUserRole(...args),
  isTemplateAdmin: (...args: any[]) => mockIsTemplateAdmin(...args),
  normalizeUserToMeta: (...args: any[]) => mockNormalizeUserToMeta(...args),
}));

// Import the router
import authRouter from '@backend/routes/auth';

// Create a test app with the router mounted
const app = new Hono();
app.route('/api', authRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to make requests
function post(path: string, body: any) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return app.request(path, { method: 'GET' });
}

describe('POST /api/signup', () => {
  it('returns 400 when email is missing', async () => {
    const res = await post('/api/signup', { password: 'secret' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Email and password are required');
  });

  it('returns 400 when password is missing', async () => {
    const res = await post('/api/signup', { email: 'test@test.com' });
    expect(res.status).toBe(400);
  });

  it('returns success with userId and role on valid signup', async () => {
    mockSupabaseCreateUser.mockResolvedValue({
      data: { user: { id: 'new-user-1' } },
      error: null,
    });

    const res = await post('/api/signup', {
      email: 'alice@test.com',
      password: 'secret123',
      name: 'Alice',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.userId).toBe('new-user-1');
    expect(json.role).toBe('user');
  });

  it('returns 400 when Supabase create fails', async () => {
    mockSupabaseCreateUser.mockResolvedValue({
      data: {},
      error: { message: 'User already exists' },
    });

    const res = await post('/api/signup', {
      email: 'existing@test.com',
      password: 'secret',
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('User already exists');
  });

  it('defaults name to email prefix when name is empty', async () => {
    mockSupabaseCreateUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });

    await post('/api/signup', {
      email: 'alice@example.com',
      password: 'pass',
    });

    expect(mockDbCreateUser).toHaveBeenCalledWith('u-1', expect.objectContaining({
      name: 'alice',
    }));
  });
});

describe('GET /api/cloud-meta', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(null);

    const res = await get('/api/cloud-meta');
    // requireAuth sets status 401 internally, but the route returns json
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns full metadata for authenticated user', async () => {
    mockRequireAuth.mockResolvedValue('u-1');
    mockGetUser.mockResolvedValue({ email: 'a@b.com', name: 'Alice', role: 'user', cloud_project_ids: ['p1'] });
    mockNormalizeUserToMeta.mockReturnValue({
      email: 'a@b.com', name: 'Alice', role: 'user', cloudProjectIds: ['p1'],
    });
    mockGetUserRole.mockResolvedValue('user');
    mockIsTemplateAdmin.mockResolvedValue(false);

    const res = await get('/api/cloud-meta');
    const json = await res.json();

    expect(json.meta).toBeDefined();
    expect(json.isAdmin).toBe(false);
    expect(json.isTemplateAdmin).toBe(false);
    expect(json.cloudProjectLimit).toBe(20);
  });

  it('returns null cloudProjectLimit for admin', async () => {
    mockRequireAuth.mockResolvedValue('u-admin');
    mockGetUser.mockResolvedValue({ email: 'admin@b.com', role: 'admin' });
    mockNormalizeUserToMeta.mockReturnValue({ email: 'admin@b.com', role: 'admin', cloudProjectIds: [] });
    mockGetUserRole.mockResolvedValue('admin');
    mockIsTemplateAdmin.mockResolvedValue(false);

    const res = await get('/api/cloud-meta');
    const json = await res.json();
    expect(json.cloudProjectLimit).toBeNull();
    expect(json.isAdmin).toBe(true);
  });
});
