import { Hono } from 'hono';
import { kvGet, kvMget } from '../db.js';
import { requireAuth, isTemplateAdmin, normalizeMeta } from '../middleware/auth.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// GET /api/templates — Public (no auth)
// ---------------------------------------------------------------------------
router.get('/templates', async (c) => {
    try {
        // Get template admin user ID from app config (strip JSONB quotes)
        const templateAdminIdRaw = await kvGet('app:template_admin_user_id');
        if (!templateAdminIdRaw) {
            return c.json({ templates: [] });
        }
        const templateAdminId = String(templateAdminIdRaw).replace(/^"|"$/g, '');

        // Load template admin's meta to get their cloud projects
        const rawMeta = await kvGet(`user:${templateAdminId}:meta`);
        const meta = normalizeMeta(rawMeta);
        const projectIds: string[] = meta.cloudProjectIds;

        if (projectIds.length === 0) {
            return c.json({ templates: [] });
        }

        // Batch load all snapshots
        const snapshotKeys = projectIds.map(id => `project:${id}:snapshot`);
        const snapshots = await kvMget(snapshotKeys);

        // Filter for projects with isTemplate flag (check snapshot.isTemplate or snapshot.project.isTemplate)
        const projects = projectIds
            .map((id, idx) => {
                const snap = snapshots[idx];
                return {
                    id: id,
                    name: snap?.project?.name ?? snap?.name ?? 'Untitled',
                    isTemplate: true,
                    storage_data: snap || {},
                    // Add an index so the frontend dropdown knows which one is active globally
                    _origIdx: idx
                };
            })
            .filter(p => p.storage_data?.isTemplate === true || p.storage_data?.project?.isTemplate === true);

        // Re-number the indices after filtering
        projects.forEach((p, i) => { p._origIdx = i; });

        return c.json({ projects });
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
