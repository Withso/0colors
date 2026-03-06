import { Hono } from 'hono';
import { kvGet, kvMget } from '../db.js';
import { requireAuth, normalizeMeta } from '../middleware/auth.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// GET /api/figma-tokens/:projectId — Authenticated
// ---------------------------------------------------------------------------
router.get('/figma-tokens/:projectId', async (c) => {
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
        if (!snapshot) {
            return c.json({ error: 'Project snapshot not found' }, 404);
        }

        // Block sample and template projects
        if (snapshot.isSample || snapshot.isTemplate || snapshot.project?.isSample || snapshot.project?.isTemplate) {
            return c.json({ error: 'Cannot export tokens from sample/template projects' }, 403);
        }

        return c.json({
            projectId,
            projectName: snapshot.name ?? snapshot.project?.name ?? 'Untitled',
            themes: snapshot.themes ?? [],
            computedAt: snapshot._syncedAt ?? null,
            schemaVersion: snapshot.schemaVersion ?? null,
            renames: snapshot.renames ?? {},
        });
    } catch (err: any) {
        console.error('[figma-tokens] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/figma-projects — Authenticated
// ---------------------------------------------------------------------------
router.get('/figma-projects', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const rawMeta = await kvGet(`user:${userId}:meta`);
        const meta = normalizeMeta(rawMeta);
        const projectIds: string[] = meta.cloudProjectIds;

        if (projectIds.length === 0) {
            return c.json({ projects: [] });
        }

        const snapshotKeys = projectIds.map(id => `project:${id}:snapshot`);
        const snapshots = await kvMget(snapshotKeys);

        const projects = projectIds.map((id, idx) => {
            const snap = snapshots[idx];
            if (!snap) return null;
            // Skip sample/template projects
            if (snap.isSample || snap.isTemplate || snap.project?.isSample || snap.project?.isTemplate) return null;
            return {
                projectId: id,
                projectName: snap.name ?? snap.project?.name ?? 'Untitled',
                hasComputedTokens: !!(snap.computedTokens),
                computedAt: snap._syncedAt ?? null,
                themes: snap.themes ?? [],
            };
        }).filter(Boolean);

        return c.json({ projects });
    } catch (err: any) {
        console.error('[figma-projects] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
