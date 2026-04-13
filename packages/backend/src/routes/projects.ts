import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
    getUser, updateUser, getProjectOwner, getProjectSnapshot,
    upsertProject, deleteProject, deleteTokenOutputs,
    deleteDevConfig, deleteWebhookPending,
    getCommunityMeta, deleteCommunityPublication,
    batchUpsertProjects, getProjectsByIds, upsertProjectOwner,
    lockProject, refreshLock, unlockProject, forceLockProject,
} from '../db.js';
import { CLOUD_PROJECT_LIMIT, SYNC_BATCH_MAX } from '../constants.js';
import { requireAuth, getUserRole, normalizeUserToMeta } from '../middleware/auth.js';
import { invalidateCommunityListCache } from './community.js';

const router = new Hono();

// ── SSE lock notification registry ──
// Maps projectId → Set of { sessionId, writer } for connected SSE clients.
// When a lock changes, we push an event to all connected clients for that project.
interface LockSSEClient {
    sessionId: string;
    write: (event: string, data: string) => Promise<void>;
    close: () => void;
}
const lockClients = new Map<string, Set<LockSSEClient>>();

function addLockClient(projectId: string, client: LockSSEClient) {
    if (!lockClients.has(projectId)) lockClients.set(projectId, new Set());
    lockClients.get(projectId)!.add(client);
}

function removeLockClient(projectId: string, client: LockSSEClient) {
    lockClients.get(projectId)?.delete(client);
    if (lockClients.get(projectId)?.size === 0) lockClients.delete(projectId);
}

/** Push a lock event to all connected SSE clients for a project, except the sender */
function notifyLockChange(projectId: string, event: string, data: any, excludeSessionId?: string) {
    const clients = lockClients.get(projectId);
    if (!clients) return;
    const payload = JSON.stringify(data);
    for (const client of clients) {
        if (client.sessionId === excludeSessionId) continue;
        client.write(event, payload).catch(() => {
            // Client disconnected — remove it
            removeLockClient(projectId, client);
        });
    }
}

// ---------------------------------------------------------------------------
// POST /api/cloud-register
// ---------------------------------------------------------------------------
router.post('/cloud-register', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { projectId } = body;
        if (!projectId) {
            return c.json({ error: 'projectId is required' }, 400);
        }

        const user = await getUser(userId);
        const meta = normalizeUserToMeta(user);
        const role = await getUserRole(userId);

        // Enforce project limit for non-admins (admin = unlimited)
        if (role !== 'admin' && meta.cloudProjectIds.length >= CLOUD_PROJECT_LIMIT) {
            return c.json({
                error: `Cloud project limit reached (max ${CLOUD_PROJECT_LIMIT})`,
                limit: CLOUD_PROJECT_LIMIT,
            }, 403);
        }

        // Check if already registered
        if (meta.cloudProjectIds.includes(projectId)) {
            return c.json({ success: true, meta });
        }

        // Register: add to list and persist
        meta.cloudProjectIds = [...meta.cloudProjectIds, projectId];
        await updateUser(userId, { cloud_project_ids: meta.cloudProjectIds });
        await upsertProjectOwner(projectId, userId);

        return c.json({ success: true, meta });
    } catch (err: any) {
        console.error('[cloud-register] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/cloud-unregister
// ---------------------------------------------------------------------------
router.post('/cloud-unregister', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { projectId } = body;
        if (!projectId) {
            return c.json({ error: 'projectId is required' }, 400);
        }

        // Verify ownership
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        // Remove from user meta
        const user = await getUser(userId);
        const meta = normalizeUserToMeta(user);
        meta.cloudProjectIds = meta.cloudProjectIds.filter((id: string) => id !== projectId);
        await updateUser(userId, { cloud_project_ids: meta.cloudProjectIds });

        // Delete project data
        await deleteProject(projectId);

        // Clean up community entries if published
        const communityMeta = await getCommunityMeta(projectId);
        if (communityMeta) {
            await deleteCommunityPublication(projectId);
            invalidateCommunityListCache();
        }

        // Clean up dev-mode data
        await deleteDevConfig(projectId);
        await deleteWebhookPending(projectId);
        await deleteTokenOutputs(projectId);

        return c.json({ success: true, meta });
    } catch (err: any) {
        console.error('[cloud-unregister] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/sync
// ---------------------------------------------------------------------------
router.post('/sync', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { projectId, snapshot } = body;
        if (!projectId || !snapshot) {
            return c.json({ error: 'projectId and snapshot are required' }, 400);
        }

        // Verify ownership via user's cloudProjectIds
        const user = await getUser(userId);
        const meta = normalizeUserToMeta(user);
        if (!meta.cloudProjectIds.includes(projectId)) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        // Store snapshot and owner
        const syncedAt = Date.now();
        await upsertProject(projectId, userId, { ...snapshot, _syncedAt: syncedAt, _userId: userId });

        return c.json({ success: true, syncedAt });
    } catch (err: any) {
        console.error('[sync] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/load/:projectId
// ---------------------------------------------------------------------------
router.get('/load/:projectId', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const projectId = c.req.param('projectId');

        // Verify ownership
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        const snapshot = await getProjectSnapshot(projectId);
        return c.json({ snapshot: snapshot ?? null });
    } catch (err: any) {
        console.error('[load] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/load-all
// ---------------------------------------------------------------------------
router.get('/load-all', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const user = await getUser(userId);
        const meta = normalizeUserToMeta(user);
        const projectIds: string[] = meta.cloudProjectIds;

        console.log(`[load-all] userId=${userId}, cloudProjectIds=${JSON.stringify(projectIds)}`);

        if (projectIds.length === 0) {
            return c.json({ projects: [] });
        }

        // Batch load all project snapshots
        const projectRows = await getProjectsByIds(projectIds);
        const projectMap = new Map(projectRows.map(p => [p.id, p.snapshot]));

        console.log(`[load-all] Fetched ${projectRows.length} of ${projectIds.length} snapshots`);

        const projects = projectIds.map(id => ({
            projectId: id,
            snapshot: projectMap.get(id) ?? null,
        })).filter(p => p.snapshot !== null);

        return c.json({ projects });
    } catch (err: any) {
        console.error('[load-all] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/sync-batch
// ---------------------------------------------------------------------------
router.post('/sync-batch', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { projects } = body;
        if (!Array.isArray(projects) || projects.length === 0) {
            return c.json({ error: 'projects array is required' }, 400);
        }

        if (projects.length > SYNC_BATCH_MAX) {
            return c.json({ error: `Max ${SYNC_BATCH_MAX} projects per batch` }, 400);
        }

        // Verify ownership via user meta
        const user = await getUser(userId);
        const meta = normalizeUserToMeta(user);
        const ownedIds = new Set(meta.cloudProjectIds);

        const unauthorized = projects.filter((p: any) => !ownedIds.has(p.projectId));
        if (unauthorized.length > 0) {
            return c.json({
                error: 'Not the owner of some projects',
                unauthorizedProjects: unauthorized.map((p: any) => p.projectId),
            }, 403);
        }

        // Batch upsert all snapshots + owners
        const entries = projects.map((p: any) => ({
            id: p.projectId,
            ownerId: userId,
            snapshot: { ...p.snapshot, _syncedAt: Date.now(), _userId: userId },
        }));
        await batchUpsertProjects(entries);

        return c.json({
            success: true,
            syncedAt: Date.now(),
            count: projects.length,
        });
    } catch (err: any) {
        console.error('[sync-batch] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/project-lock-stream/:projectId — SSE stream for instant lock notifications
// Client connects when viewing a cloud project. Server pushes events when lock changes.
// ---------------------------------------------------------------------------
router.get('/project-lock-stream/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    const sessionId = c.req.query('sessionId') || '';
    if (!projectId || !sessionId) return c.json({ error: 'Missing projectId or sessionId' }, 400);

    return streamSSE(c, async (stream) => {
        const client: LockSSEClient = {
            sessionId,
            write: async (event: string, data: string) => {
                await stream.writeSSE({ event, data, id: String(Date.now()) });
            },
            close: () => stream.close(),
        };

        addLockClient(projectId, client);
        console.log(`[SSE] Client ${sessionId} connected for project ${projectId} (${lockClients.get(projectId)?.size || 0} total)`);

        // Send initial ping to confirm connection
        await stream.writeSSE({ event: 'connected', data: JSON.stringify({ sessionId, projectId }), id: '0' });

        // Keep connection alive with periodic pings (every 25s)
        const pingInterval = setInterval(async () => {
            try {
                await stream.writeSSE({ event: 'ping', data: '', id: String(Date.now()) });
            } catch {
                clearInterval(pingInterval);
                removeLockClient(projectId, client);
            }
        }, 25_000);

        // Wait until the client disconnects
        stream.onAbort(() => {
            clearInterval(pingInterval);
            removeLockClient(projectId, client);
            console.log(`[SSE] Client ${sessionId} disconnected from project ${projectId}`);
        });

        // Keep the stream open indefinitely — the onAbort handler cleans up
        await new Promise(() => {}); // Never resolves — stream stays open
    });
});

// ---------------------------------------------------------------------------
// POST /api/project-lock — Acquire lock on a project
// ---------------------------------------------------------------------------
router.post('/project-lock', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);
        const { projectId, sessionId } = await c.req.json();
        if (!projectId || !sessionId) return c.json({ error: 'Missing projectId or sessionId' }, 400);
        const result = await lockProject(projectId, userId, sessionId);
        if (result.locked) {
            // Notify other connected clients that this session acquired the lock
            notifyLockChange(projectId, 'lock-acquired', { sessionId, userId }, sessionId);
        }
        return c.json(result);
    } catch (err: any) {
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/project-lock-heartbeat — Refresh lock (keep alive)
// ---------------------------------------------------------------------------
router.post('/project-lock-heartbeat', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);
        const { projectId, sessionId } = await c.req.json();
        if (!projectId || !sessionId) return c.json({ error: 'Missing projectId or sessionId' }, 400);
        const ok = await refreshLock(projectId, sessionId);
        return c.json({ ok });
    } catch (err: any) {
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/project-unlock — Release lock
// ---------------------------------------------------------------------------
router.post('/project-unlock', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);
        const { projectId, sessionId } = await c.req.json();
        if (!projectId || !sessionId) return c.json({ error: 'Missing projectId or sessionId' }, 400);
        console.log(`[unlock] Project ${projectId} by session ${sessionId}`);
        const ok = await unlockProject(projectId, sessionId);
        console.log(`[unlock] Result: ok=${ok}`);
        if (ok) {
            notifyLockChange(projectId, 'lock-released', { sessionId }, sessionId);
        }
        return c.json({ ok });
    } catch (err: any) {
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/project-lock-force — Force-take lock (user chose "Open here")
// Instantly notifies the old session via SSE
// ---------------------------------------------------------------------------
router.post('/project-lock-force', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);
        const { projectId, sessionId } = await c.req.json();
        if (!projectId || !sessionId) return c.json({ error: 'Missing projectId or sessionId' }, 400);
        const ok = await forceLockProject(projectId, userId, sessionId);
        if (ok) {
            // INSTANT notification to old session: "lock-taken-over"
            // This pushes via SSE to all OTHER connected clients for this project
            notifyLockChange(projectId, 'lock-taken-over', { newSessionId: sessionId, userId }, sessionId);
        }
        return c.json({ ok });
    } catch (err: any) {
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
