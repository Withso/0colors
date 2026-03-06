import { Hono } from 'hono';
import { createUser } from '../auth.js';
import { kvGet, kvSet } from '../db.js';
import { CLOUD_PROJECT_LIMIT } from '../constants.js';
import { requireAuth, getUserRole, isTemplateAdmin, normalizeMeta } from '../middleware/auth.js';

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

        const { data, error } = await createUser(email, password, name ?? '');
        if (error) {
            console.error('[signup] Supabase createUser error:', error.message);
            return c.json({ error: error.message }, 400);
        }

        const userId = data.user?.id;
        if (userId) {
            await kvSet(`user:${userId}:meta`, {
                email,
                name: name || email.split('@')[0],
                createdAt: Date.now(),
                cloudProjectIds: [],
                role: 'user',
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

        const rawMeta = await kvGet(`user:${userId}:meta`);
        const meta = normalizeMeta(rawMeta);
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
