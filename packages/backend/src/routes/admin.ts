import { Hono } from 'hono';
import { kvGet, kvMget } from '../db.js';
import { requireAdmin, isAdmin, isTemplateAdmin, normalizeMeta } from '../middleware/auth.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// GET /api/debug-auth — Admin only
// ---------------------------------------------------------------------------
router.get('/debug-auth', async (c) => {
    try {
        const userId = await requireAdmin(c);
        if (!userId) return c.json({ error: 'Admin access required' }, 403);

        const admin = await isAdmin(userId);
        const tplAdmin = await isTemplateAdmin(userId);

        return c.json({
            success: true,
            userId,
            isAdmin: admin,
            isTemplateAdmin: tplAdmin,
        });
    } catch (err: any) {
        console.error('[debug-auth] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/debug-cloud-state/:userId — Admin only
// ---------------------------------------------------------------------------
router.get('/debug-cloud-state/:userId', async (c) => {
    try {
        const adminId = await requireAdmin(c);
        if (!adminId) return c.json({ error: 'Admin access required' }, 403);

        const targetUserId = c.req.param('userId');
        const rawMeta = await kvGet(`user:${targetUserId}:meta`);
        const meta = normalizeMeta(rawMeta);
        const admin = await isAdmin(targetUserId);
        const tplAdmin = await isTemplateAdmin(targetUserId);
        const projectIds: string[] = meta.cloudProjectIds;

        // Load all project snapshots for inspection
        let projects: any[] = [];
        if (projectIds.length > 0) {
            const snapshotKeys = projectIds.map(id => `project:${id}:snapshot`);
            const ownerKeys = projectIds.map(id => `project:${id}:owner`);
            const [snapshots, owners] = await Promise.all([
                kvMget(snapshotKeys),
                kvMget(ownerKeys),
            ]);

            projects = projectIds.map((id, idx) => ({
                projectId: id,
                owner: owners[idx],
                hasSnapshot: snapshots[idx] !== null,
                snapshotName: snapshots[idx]?.project?.name ?? snapshots[idx]?.name ?? null,
                isTemplate: snapshots[idx]?.isTemplate ?? snapshots[idx]?.project?.isTemplate ?? false,
                isSample: snapshots[idx]?.isSample ?? snapshots[idx]?.project?.isSample ?? false,
            }));
        }

        return c.json({
            success: true,
            targetUserId,
            meta: meta ?? null,
            isAdmin: admin,
            isTemplateAdmin: tplAdmin,
            projectCount: projectIds.length,
            projects,
        });
    } catch (err: any) {
        console.error('[debug-cloud-state] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
