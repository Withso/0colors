import { Hono } from 'hono';
import { getUser, getProjectsByIds } from '../db.js';
import { requireAdmin, isAdmin, isTemplateAdmin, normalizeUserToMeta } from '../middleware/auth.js';

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
        const targetUser = await getUser(targetUserId);
        const meta = normalizeUserToMeta(targetUser);
        const admin = await isAdmin(targetUserId);
        const tplAdmin = await isTemplateAdmin(targetUserId);
        const projectIds: string[] = meta.cloudProjectIds;

        // Load all project data for inspection
        let projects: any[] = [];
        if (projectIds.length > 0) {
            const projectRows = await getProjectsByIds(projectIds);
            const projectMap = new Map(projectRows.map(p => [p.id, p]));

            projects = projectIds.map(id => {
                const proj = projectMap.get(id);
                return {
                    projectId: id,
                    owner: proj?.owner_id ?? null,
                    hasSnapshot: proj?.snapshot !== null && proj?.snapshot !== undefined,
                    snapshotName: proj?.snapshot?.project?.name ?? proj?.snapshot?.name ?? null,
                    isTemplate: proj?.snapshot?.isTemplate ?? proj?.snapshot?.project?.isTemplate ?? false,
                    isSample: proj?.snapshot?.isSample ?? proj?.snapshot?.project?.isSample ?? false,
                };
            });
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
