/**
 * MSW handlers for auth/sync endpoint mocking in integration tests.
 *
 * Validates the dual-header auth pattern:
 *   - Authorization: Bearer <publicAnonKey>  (gateway)
 *   - X-User-Token: <JWT>                    (user identity)
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const BASE = 'http://localhost:4455/api';

// ── Default test data ──

const DEFAULT_USER_META = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  createdAt: Date.now(),
  cloudProjectIds: ['proj-1', 'proj-2'],
};

// ── Helper: validate auth headers ──

function validateAuth(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  const userToken = request.headers.get('X-User-Token');
  return !!(auth && userToken);
}

function unauthorized() {
  return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// ── Handlers ──

export const authHandlers = [
  // POST /api/signup
  http.post(`${BASE}/signup`, async ({ request }) => {
    const body = await request.json() as any;
    if (!body.email || !body.password) {
      return HttpResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    return HttpResponse.json({
      success: true,
      userId: 'test-uid-123',
      role: 'user',
    });
  }),

  // GET /api/cloud-meta
  http.get(`${BASE}/cloud-meta`, ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    return HttpResponse.json({
      meta: DEFAULT_USER_META,
      isAdmin: false,
      isTemplateAdmin: false,
      cloudProjectLimit: 20,
    });
  }),
];

export const syncHandlers = [
  // POST /api/sync
  http.post(`${BASE}/sync`, async ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    const body = await request.json() as any;
    if (!body.projectId || !body.snapshot) {
      return HttpResponse.json({ error: 'projectId and snapshot are required' }, { status: 400 });
    }
    return HttpResponse.json({ success: true, syncedAt: Date.now() });
  }),

  // GET /api/load-all
  http.get(`${BASE}/load-all`, ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    return HttpResponse.json({ projects: [] });
  }),

  // GET /api/load/:projectId
  http.get(`${BASE}/load/:projectId`, ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    return HttpResponse.json({ snapshot: null });
  }),

  // POST /api/cloud-register
  http.post(`${BASE}/cloud-register`, async ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    const body = await request.json() as any;
    if (!body.projectId) {
      return HttpResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    return HttpResponse.json({
      success: true,
      meta: { ...DEFAULT_USER_META, cloudProjectIds: [...DEFAULT_USER_META.cloudProjectIds, body.projectId] },
    });
  }),

  // POST /api/sync-batch
  http.post(`${BASE}/sync-batch`, async ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    const body = await request.json() as any;
    if (!Array.isArray(body.projects) || body.projects.length === 0) {
      return HttpResponse.json({ error: 'projects array is required' }, { status: 400 });
    }
    return HttpResponse.json({ success: true, syncedAt: Date.now(), count: body.projects.length });
  }),
];

export const lockHandlers = [
  // POST /api/project-lock
  http.post(`${BASE}/project-lock`, async ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    return HttpResponse.json({ locked: true });
  }),

  // POST /api/project-lock-heartbeat
  http.post(`${BASE}/project-lock-heartbeat`, async ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    return HttpResponse.json({ ok: true });
  }),

  // POST /api/project-unlock
  http.post(`${BASE}/project-unlock`, async ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    return HttpResponse.json({ ok: true });
  }),

  // POST /api/project-lock-force
  http.post(`${BASE}/project-lock-force`, async ({ request }) => {
    if (!validateAuth(request)) return unauthorized();
    return HttpResponse.json({ ok: true });
  }),
];

export const allHandlers = [...authHandlers, ...syncHandlers, ...lockHandlers];

// ── Pre-configured MSW server ──
export const server = setupServer(...allHandlers);
