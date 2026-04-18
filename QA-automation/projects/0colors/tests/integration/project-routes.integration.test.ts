/**
 * Backend Project Routes — Integration tests
 * Source: packages/backend/src/routes/projects.ts
 *
 * Tests sync, cloud-register, load, batch, and lock endpoints with mocked DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ── Mocks ──

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn().mockResolvedValue(undefined);
const mockGetProjectOwner = vi.fn();
const mockGetProjectSnapshot = vi.fn();
const mockUpsertProject = vi.fn().mockResolvedValue(undefined);
const mockDeleteProject = vi.fn().mockResolvedValue(undefined);
const mockDeleteTokenOutputs = vi.fn().mockResolvedValue(undefined);
const mockDeleteDevConfig = vi.fn().mockResolvedValue(undefined);
const mockDeleteWebhookPending = vi.fn().mockResolvedValue(undefined);
const mockGetCommunityMeta = vi.fn().mockResolvedValue(null);
const mockDeleteCommunityPublication = vi.fn().mockResolvedValue(undefined);
const mockBatchUpsertProjects = vi.fn().mockResolvedValue(undefined);
const mockGetProjectsByIds = vi.fn();
const mockUpsertProjectOwner = vi.fn().mockResolvedValue(undefined);
const mockLockProject = vi.fn();
const mockRefreshLock = vi.fn();
const mockUnlockProject = vi.fn();
const mockForceLockProject = vi.fn();

vi.mock('@backend/db.js', () => ({
  getUser: (...args: any[]) => mockGetUser(...args),
  updateUser: (...args: any[]) => mockUpdateUser(...args),
  getProjectOwner: (...args: any[]) => mockGetProjectOwner(...args),
  getProjectSnapshot: (...args: any[]) => mockGetProjectSnapshot(...args),
  upsertProject: (...args: any[]) => mockUpsertProject(...args),
  deleteProject: (...args: any[]) => mockDeleteProject(...args),
  deleteTokenOutputs: (...args: any[]) => mockDeleteTokenOutputs(...args),
  deleteDevConfig: (...args: any[]) => mockDeleteDevConfig(...args),
  deleteWebhookPending: (...args: any[]) => mockDeleteWebhookPending(...args),
  getCommunityMeta: (...args: any[]) => mockGetCommunityMeta(...args),
  deleteCommunityPublication: (...args: any[]) => mockDeleteCommunityPublication(...args),
  batchUpsertProjects: (...args: any[]) => mockBatchUpsertProjects(...args),
  getProjectsByIds: (...args: any[]) => mockGetProjectsByIds(...args),
  upsertProjectOwner: (...args: any[]) => mockUpsertProjectOwner(...args),
  lockProject: (...args: any[]) => mockLockProject(...args),
  refreshLock: (...args: any[]) => mockRefreshLock(...args),
  unlockProject: (...args: any[]) => mockUnlockProject(...args),
  forceLockProject: (...args: any[]) => mockForceLockProject(...args),
}));

const mockRequireAuth = vi.fn();
const mockGetUserRole = vi.fn();
const mockNormalizeUserToMeta = vi.fn();

vi.mock('@backend/middleware/auth.js', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  getUserRole: (...args: any[]) => mockGetUserRole(...args),
  normalizeUserToMeta: (...args: any[]) => mockNormalizeUserToMeta(...args),
}));

vi.mock('@backend/constants.js', () => ({
  CLOUD_PROJECT_LIMIT: 20,
  SYNC_BATCH_MAX: 50,
}));

vi.mock('@backend/routes/community.js', () => ({
  invalidateCommunityListCache: vi.fn(),
}));

import projectRouter from '@backend/routes/projects';

const app = new Hono();
app.route('/api', projectRouter);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated user with some projects
  mockRequireAuth.mockResolvedValue('u-1');
  mockGetUserRole.mockResolvedValue('user');
  mockNormalizeUserToMeta.mockReturnValue({
    email: 'a@b.com', name: 'Test', role: 'user',
    cloudProjectIds: ['p1', 'p2'],
  });
  mockGetUser.mockResolvedValue({
    email: 'a@b.com', name: 'Test', role: 'user',
    cloud_project_ids: ['p1', 'p2'],
  });
});

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

describe('POST /api/cloud-register', () => {
  it('succeeds for valid user', async () => {
    const res = await post('/api/cloud-register', { projectId: 'p-new' });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalled();
    expect(mockUpsertProjectOwner).toHaveBeenCalledWith('p-new', 'u-1');
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(null);
    const res = await post('/api/cloud-register', { projectId: 'p1' });
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when projectId missing', async () => {
    const res = await post('/api/cloud-register', {});
    expect(res.status).toBe(400);
  });

  it('returns success when already registered (idempotent)', async () => {
    const res = await post('/api/cloud-register', { projectId: 'p1' }); // p1 already in list
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockUpdateUser).not.toHaveBeenCalled(); // No update needed
  });

  it('returns 403 when limit reached for non-admin', async () => {
    mockNormalizeUserToMeta.mockReturnValue({
      cloudProjectIds: Array.from({ length: 20 }, (_, i) => `p${i}`),
    });
    const res = await post('/api/cloud-register', { projectId: 'p-new' });
    expect(res.status).toBe(403);
  });

  it('no limit for admin', async () => {
    mockGetUserRole.mockResolvedValue('admin');
    mockNormalizeUserToMeta.mockReturnValue({
      cloudProjectIds: Array.from({ length: 20 }, (_, i) => `p${i}`),
    });
    const res = await post('/api/cloud-register', { projectId: 'p-new' });
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});

describe('POST /api/sync', () => {
  it('upserts snapshot with _syncedAt and _userId', async () => {
    const snapshot = { nodes: [{ id: 'n1' }], tokens: [], groups: [] };
    const res = await post('/api/sync', { projectId: 'p1', snapshot });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.syncedAt).toBeGreaterThan(0);
    expect(mockUpsertProject).toHaveBeenCalledWith('p1', 'u-1', expect.objectContaining({
      _userId: 'u-1',
    }));
  });

  it('returns 403 when project not in cloudProjectIds', async () => {
    const res = await post('/api/sync', { projectId: 'unauthorized-proj', snapshot: {} });
    expect(res.status).toBe(403);
  });

  it('returns 400 when projectId or snapshot missing', async () => {
    const res = await post('/api/sync', { projectId: 'p1' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(null);
    const res = await post('/api/sync', { projectId: 'p1', snapshot: {} });
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });
});

describe('GET /api/load/:projectId', () => {
  it('returns snapshot for owner', async () => {
    mockGetProjectOwner.mockResolvedValue('u-1');
    mockGetProjectSnapshot.mockResolvedValue({ nodes: [{ id: 'n1' }] });

    const res = await get('/api/load/p1');
    const json = await res.json();
    expect(json.snapshot).toBeDefined();
    expect(json.snapshot.nodes).toHaveLength(1);
  });

  it('returns 403 when not owner', async () => {
    mockGetProjectOwner.mockResolvedValue('u-other');
    const res = await get('/api/load/p1');
    expect(res.status).toBe(403);
  });

  it('returns null snapshot when not found', async () => {
    mockGetProjectOwner.mockResolvedValue('u-1');
    mockGetProjectSnapshot.mockResolvedValue(null);

    const res = await get('/api/load/p1');
    const json = await res.json();
    expect(json.snapshot).toBeNull();
  });
});

describe('GET /api/load-all', () => {
  it('returns all user project snapshots', async () => {
    mockGetProjectsByIds.mockResolvedValue([
      { id: 'p1', snapshot: { nodes: [] } },
      { id: 'p2', snapshot: { nodes: [] } },
    ]);

    const res = await get('/api/load-all');
    const json = await res.json();
    expect(json.projects).toHaveLength(2);
  });

  it('returns empty array when no projects', async () => {
    mockNormalizeUserToMeta.mockReturnValue({ cloudProjectIds: [] });
    const res = await get('/api/load-all');
    const json = await res.json();
    expect(json.projects).toEqual([]);
  });
});

describe('POST /api/sync-batch', () => {
  it('batch upserts multiple projects', async () => {
    const res = await post('/api/sync-batch', {
      projects: [
        { projectId: 'p1', snapshot: { nodes: [] } },
        { projectId: 'p2', snapshot: { nodes: [] } },
      ],
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);
    expect(mockBatchUpsertProjects).toHaveBeenCalled();
  });

  it('returns 400 when projects array empty', async () => {
    const res = await post('/api/sync-batch', { projects: [] });
    expect(res.status).toBe(400);
  });

  it('returns 403 when any project unauthorized', async () => {
    const res = await post('/api/sync-batch', {
      projects: [
        { projectId: 'p1', snapshot: {} },
        { projectId: 'unauthorized', snapshot: {} },
      ],
    });
    expect(res.status).toBe(403);
  });
});

describe('Session Lock Endpoints', () => {
  it('POST /api/project-lock acquires lock', async () => {
    mockLockProject.mockResolvedValue({ locked: true });
    const res = await post('/api/project-lock', { projectId: 'p1', sessionId: 's-1' });
    const json = await res.json();
    expect(json.locked).toBe(true);
  });

  it('POST /api/project-lock-heartbeat refreshes lock', async () => {
    mockRefreshLock.mockResolvedValue(true);
    const res = await post('/api/project-lock-heartbeat', { projectId: 'p1', sessionId: 's-1' });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('POST /api/project-unlock releases lock', async () => {
    mockUnlockProject.mockResolvedValue(true);
    const res = await post('/api/project-unlock', { projectId: 'p1', sessionId: 's-1' });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('POST /api/project-lock-force takes over lock', async () => {
    mockForceLockProject.mockResolvedValue(true);
    const res = await post('/api/project-lock-force', { projectId: 'p1', sessionId: 's-1' });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('lock endpoints return 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(null);

    const endpoints = [
      ['/api/project-lock', { projectId: 'p1', sessionId: 's' }],
      ['/api/project-lock-heartbeat', { projectId: 'p1', sessionId: 's' }],
      ['/api/project-unlock', { projectId: 'p1', sessionId: 's' }],
      ['/api/project-lock-force', { projectId: 'p1', sessionId: 's' }],
    ] as const;

    for (const [path, body] of endpoints) {
      const res = await post(path, body);
      const json = await res.json();
      expect(json.error, `${path} should return Unauthorized`).toBe('Unauthorized');
    }
  });

  it('lock endpoints return 400 when missing params', async () => {
    const endpoints = [
      '/api/project-lock',
      '/api/project-lock-heartbeat',
      '/api/project-unlock',
      '/api/project-lock-force',
    ];

    for (const path of endpoints) {
      const res = await post(path, {}); // Missing projectId and sessionId
      expect(res.status, `${path} should return 400`).toBe(400);
    }
  });
});
