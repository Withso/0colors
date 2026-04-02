import { Hono } from 'hono';
import { createUser as supabaseCreateUser } from '../auth.js';
import { getUser, createUser } from '../db.js';
import { CLOUD_PROJECT_LIMIT } from '../constants.js';
import { requireAuth, getUserRole, isTemplateAdmin, normalizeUserToMeta } from '../middleware/auth.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// POST /api/signup
// ---------------------------------------------------------------------------
router.post('/signup', async (c) => {
    try {
        const body = await c.req.json();
        const { email, password, name } = body;

        if (!email || !password) {
            return c.json({ error: 'Email and password are required' }, 400);
        }

        const { data, error } = await supabaseCreateUser(email, password, name ?? '');
        if (error) {
            console.error('[signup] Supabase createUser error:', error.message);
            return c.json({ error: error.message }, 400);
        }

        const userId = data.user?.id;
        if (userId) {
            await createUser(userId, {
                email,
                name: name || email.split('@')[0],
                role: 'user',
                cloud_project_ids: [],
            });
        }

        return c.json({ success: true, userId, role: 'user' });
    } catch (err: any) {
        console.error('[signup] Unexpected error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/cloud-meta
// ---------------------------------------------------------------------------
router.get('/cloud-meta', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const user = await getUser(userId);
        const meta = normalizeUserToMeta(user);
        const role = await getUserRole(userId);
        const tplAdmin = await isTemplateAdmin(userId);

        // Stamp role into meta
        meta.role = role;

        return c.json({
            meta,
            isAdmin: role === 'admin',
            isTemplateAdmin: tplAdmin,
            cloudProjectLimit: role === 'admin' ? null : CLOUD_PROJECT_LIMIT,
        });
    } catch (err: any) {
        console.error('[cloud-meta] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
