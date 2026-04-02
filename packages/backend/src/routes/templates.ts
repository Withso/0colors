import { Hono } from 'hono';
import { getUser, getAppSetting, getProjectsByIds } from '../db.js';
import { requireAuth, isTemplateAdmin, normalizeUserToMeta } from '../middleware/auth.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// GET /api/templates — Public (no auth)
// ---------------------------------------------------------------------------
router.get('/templates', async (c) => {
    try {
        // Get template admin user ID from app settings
        const templateAdminIdRaw = await getAppSetting('template_admin_user_id');
        if (!templateAdminIdRaw) {
            return c.json({ templates: [] });
        }
        const templateAdminId = String(templateAdminIdRaw).replace(/^"|"$/g, '');

        // Load template admin's user record to get their cloud projects
        const adminUser = await getUser(templateAdminId);
        const meta = normalizeUserToMeta(adminUser);
        const projectIds: string[] = meta.cloudProjectIds;

        if (projectIds.length === 0) {
            return c.json({ templates: [] });
        }

        // Batch load all project snapshots
        const projectRows = await getProjectsByIds(projectIds);
        const snapshotMap = new Map(projectRows.map(p => [p.id, p.snapshot]));

        // Filter for projects with isTemplate flag
        const templates = projectIds
            .map(id => {
                const snap = snapshotMap.get(id);
                return {
                    projectId: id,
                    name: snap?.project?.name ?? snap?.name ?? 'Untitled',
                    snapshot: snap,
                };
            })
            .filter(p => p.snapshot?.isTemplate === true || p.snapshot?.project?.isTemplate === true);

        return c.json({ templates });
    } catch (err: any) {
        console.error('[templates] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/seed-material-template — Template admin only (placeholder)
// ---------------------------------------------------------------------------
router.post('/seed-material-template', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const isTplAdmin = await isTemplateAdmin(userId);
        if (!isTplAdmin) {
            return c.json({ error: 'Template admin access required' }, 403);
        }

        // Placeholder — generation function will be provided later
        return c.json({ ok: true, message: 'placeholder' });
    } catch (err: any) {
        console.error('[seed-material-template] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/seed-material-template-direct — Template admin only (placeholder)
// ---------------------------------------------------------------------------
router.post('/seed-material-template-direct', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const isTplAdmin = await isTemplateAdmin(userId);
        if (!isTplAdmin) {
            return c.json({ error: 'Template admin access required' }, 403);
        }

        // Placeholder — generation function will be provided later
        return c.json({ ok: true, message: 'placeholder' });
    } catch (err: any) {
        console.error('[seed-material-template-direct] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
