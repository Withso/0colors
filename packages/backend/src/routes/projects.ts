import { Hono } from 'hono';
import { kvGet, kvSet, kvDel, kvMget, kvMset } from '../db.js';
import { CLOUD_PROJECT_LIMIT, SYNC_BATCH_MAX, VALID_TOKEN_FORMATS } from '../constants.js';
import { requireAuth, getUserRole, normalizeMeta } from '../middleware/auth.js';
import { invalidateCommunityListCache } from './community.js';

const router = new Hono();

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

        const rawMeta = await kvGet(`user:${userId}:meta`);
        const meta = normalizeMeta(rawMeta);
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
        await kvSet(`user:${userId}:meta`, meta);
        await kvSet(`project:${projectId}:owner`, userId);

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
        const owner = await kvGet(`project:${projectId}:owner`);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        // Remove from user meta
        const rawMeta = await kvGet(`user:${userId}:meta`);
        const meta = normalizeMeta(rawMeta);
        meta.cloudProjectIds = meta.cloudProjectIds.filter((id: string) => id !== projectId);
        await kvSet(`user:${userId}:meta`, meta);

        // Delete project data
        await kvDel(`project:${projectId}:snapshot`);
        await kvDel(`project:${projectId}:owner`);

        // Clean up community entries if published
        const communityMeta = await kvGet(`community:meta:${projectId}`);
        if (communityMeta) {
            await kvDel(`community:meta:${projectId}`);
            await kvDel(`community:snapshot:${projectId}`);
            await kvDel(`community:thumbnail:${projectId}`);
            if (communityMeta.slug) {
                await kvDel(`community:slug:${communityMeta.slug}`);
            }
            invalidateCommunityListCache();
        }

        // Clean up dev-mode keys
        await kvDel(`dev-config:${projectId}`);
        await kvDel(`webhook:${projectId}:pending`);
        for (const fmt of VALID_TOKEN_FORMATS) {
            await kvDel(`project:${projectId}:token-output:${fmt}`);
        }

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

        // Verify ownership via meta.cloudProjectIds
        const rawMeta = await kvGet(`user:${userId}:meta`);
        const meta = normalizeMeta(rawMeta);
        if (!meta.cloudProjectIds.includes(projectId)) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        // Store snapshot and owner
        const syncedAt = Date.now();
        await kvSet(`project:${projectId}:snapshot`, { ...snapshot, _syncedAt: syncedAt, _userId: userId });
        await kvSet(`project:${projectId}:owner`, userId);

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
        const owner = await kvGet(`project:${projectId}:owner`);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        const snapshot = await kvGet(`project:${projectId}:snapshot`);
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

        const rawMeta = await kvGet(`user:${userId}:meta`);
        const meta = normalizeMeta(rawMeta);
        const projectIds: string[] = meta.cloudProjectIds;

        console.log(`[load-all] userId=${userId}, cloudProjectIds=${JSON.stringify(projectIds)}`);

        if (projectIds.length === 0) {
            return c.json({ projects: [] });
        }

        // Build snapshot keys and fetch all at once
        const snapshotKeys = projectIds.map(id => `project:${id}:snapshot`);
        const snapshots = await kvMget(snapshotKeys);

        console.log(`[load-all] Fetched ${snapshots.filter(Boolean).length} of ${projectIds.length} snapshots`);

        const projects = projectIds.map((id, idx) => ({
            projectId: id,
            snapshot: snapshots[idx],
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
        const rawMeta = await kvGet(`user:${userId}:meta`);
        const meta = normalizeMeta(rawMeta);
        const ownedIds = new Set(meta.cloudProjectIds);

        const unauthorized = projects.filter((p: any) => !ownedIds.has(p.projectId));
        if (unauthorized.length > 0) {
            return c.json({
                error: 'Not the owner of some projects',
                unauthorizedProjects: unauthorized.map((p: any) => p.projectId),
            }, 403);
        }

        // Batch upsert all snapshots + owners
        const snapshotEntries: [string, any][] = projects.map((p: any) => [
            `project:${p.projectId}:snapshot`,
            { ...p.snapshot, _syncedAt: Date.now(), _userId: userId },
        ]);
        const ownerEntries: [string, any][] = projects.map((p: any) => [
            `project:${p.projectId}:owner`,
            userId,
        ]);
        await kvMset([...snapshotEntries, ...ownerEntries]);

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

export default router;
