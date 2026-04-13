import { Hono } from 'hono';
import { getUser, getAppSetting, setAppSetting, getProjectsByIds } from '../db.js';
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
        // The snapshot may store the project data in different structures:
        //   - snap.isTemplate (top-level flag)
        //   - snap.project.isTemplate (nested project object)
        //   - snap.projects[].isTemplate (array of projects in the snapshot)
        const templates = projectIds
            .map(id => {
                const snap = snapshotMap.get(id);
                // Try multiple paths to find the project name
                const projectObj = snap?.project ?? snap?.projects?.[0];
                return {
                    projectId: id,
                    name: projectObj?.name ?? snap?.name ?? 'Untitled',
                    snapshot: snap,
                };
            })
            .filter(p => {
                const snap = p.snapshot;
                if (!snap) return false;
                // Check all known locations for the isTemplate flag
                if (snap.isTemplate === true) return true;
                if (snap.project?.isTemplate === true) return true;
                if (Array.isArray(snap.projects) && snap.projects.some((proj: any) => proj?.isTemplate === true)) return true;
                return false;
            });

        // Also include the starred template ID so clients get it in a single request
        const starredRaw = await getAppSetting('starred_template_id');
        const starredTemplateId = starredRaw ? String(starredRaw).replace(/^"|"$/g, '') : null;

        return c.json({ templates, starredTemplateId });
    } catch (err: any) {
        console.error('[templates] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/templates/starred — Public (no auth)
// Returns the starred template ID that determines the default for first-time users
// ---------------------------------------------------------------------------
router.get('/templates/starred', async (c) => {
    try {
        const raw = await getAppSetting('starred_template_id');
        const starredTemplateId = raw ? String(raw).replace(/^"|"$/g, '') : null;
        return c.json({ starredTemplateId });
    } catch (err: any) {
        console.error('[templates/starred] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// PUT /api/templates/starred — Template admin only
// Sets or clears the starred template (determines default for first-time users)
// ---------------------------------------------------------------------------
router.put('/templates/starred', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const isTplAdmin = await isTemplateAdmin(userId);
        if (!isTplAdmin) {
            return c.json({ error: 'Template admin access required' }, 403);
        }

        const body = await c.req.json();
        const { templateId } = body; // null to clear

        if (templateId) {
            await setAppSetting('starred_template_id', templateId);
        } else {
            await setAppSetting('starred_template_id', null);
        }

        console.log(`[templates] Starred template ${templateId ? 'set to ' + templateId : 'cleared'} by admin ${userId}`);
        return c.json({ ok: true, starredTemplateId: templateId || null });
    } catch (err: any) {
        console.error('[templates/starred] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/seed-material-template — Template admin only (placeholder)
// ---------------------------------------------------------------------------
export default router;
