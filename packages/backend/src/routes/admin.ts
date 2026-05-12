// ============================================================================
// Admin routes — all behind requireAdmin.
//
// User management:
//   GET    /api/admin/users                        - list with status + last-seen
//   PATCH  /api/admin/users/:id                    - body: { isAdmin?, isActive? }
//   DELETE /api/admin/users/:id?transferTo=<uid>   - cascade or transfer
//   POST   /api/admin/users/:id/resend-invite      - regenerate token (pending only)
//   POST   /api/admin/users/:id/reset-link         - force password reset
//
// Settings:
//   GET    /api/admin/settings                     - all branding + general flags
//   PATCH  /api/admin/settings                     - body: { key: value }
//
// Debug (NODE_ENV !== production only):
//   GET    /api/debug-auth
//   GET    /api/debug-cloud-state/:userId
// ============================================================================

import { Hono } from 'hono';
import {
    getUser, getProjectsByIds,
    listUsersForAdmin, setUserAdmin, setUserActive,
    generateResetLink, regenerateInviteToken, deleteUserCascade,
    getAppSetting, setAppSetting,
} from '../db.js';
import { requireAdmin, isAdmin, normalizeUserToMeta } from '../middleware/auth.js';

const router = new Hono();

// ── Setting keys we expose through GET/PATCH /admin/settings ─────────────────
// Branding blobs are large; admins read/write them via this same endpoint.
const ADMIN_SETTING_KEYS = [
    'allow_public_signup',
    'instance_name',
    'attribution_enabled',
    'branding_favicon',
    'branding_logo',
] as const;
type AdminSettingKey = typeof ADMIN_SETTING_KEYS[number];
const isAdminSettingKey = (k: string): k is AdminSettingKey =>
    (ADMIN_SETTING_KEYS as readonly string[]).includes(k);

// ── User management ──────────────────────────────────────────────────────────

router.get('/admin/users', async (c) => {
    const adminId = await requireAdmin(c);
    if (!adminId) return c.json({ error: 'Admin access required' }, 403);
    try {
        const users = await listUsersForAdmin();
        return c.json({
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name,
                isAdmin: u.is_admin,
                isActive: u.is_active,
                status: u.status,
                inviteExpiresAt: u.invite_expires_at,
                invitedBy: u.invited_by,
                lastSeenAt: u.last_seen_at,
                createdAt: u.created_at,
            })),
        });
    } catch (err) {
        console.error('[admin/users] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

router.patch('/admin/users/:id', async (c) => {
    const adminId = await requireAdmin(c);
    if (!adminId) return c.json({ error: 'Admin access required' }, 403);
    try {
        const targetId = c.req.param('id');
        const body = await c.req.json().catch(() => ({}));
        const target = await getUser(targetId);
        if (!target) return c.json({ error: 'User not found' }, 404);

        if (typeof body.isAdmin === 'boolean') {
            // Don't let an admin demote themselves into a no-admins state.
            if (target.id === adminId && body.isAdmin === false) {
                const others = await listUsersForAdmin();
                const otherAdmins = others.filter(u => u.is_admin && u.is_active && u.id !== adminId);
                if (otherAdmins.length === 0) {
                    return c.json({ error: 'Cannot demote the last admin' }, 409);
                }
            }
            await setUserAdmin(targetId, body.isAdmin);
        }
        if (typeof body.isActive === 'boolean') {
            if (target.id === adminId && body.isActive === false) {
                return c.json({ error: 'Cannot deactivate your own account' }, 409);
            }
            await setUserActive(targetId, body.isActive);
        }

        return c.json({ success: true });
    } catch (err) {
        console.error('[admin/users PATCH] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

router.delete('/admin/users/:id', async (c) => {
    const adminId = await requireAdmin(c);
    if (!adminId) return c.json({ error: 'Admin access required' }, 403);
    try {
        const targetId = c.req.param('id');
        if (targetId === adminId) {
            return c.json({ error: 'Cannot delete your own account' }, 409);
        }
        const target = await getUser(targetId);
        if (!target) return c.json({ error: 'User not found' }, 404);

        const transferTo = c.req.query('transferTo') || undefined;
        if (transferTo) {
            const dest = await getUser(transferTo);
            if (!dest) return c.json({ error: 'transferTo user not found' }, 400);
        }
        await deleteUserCascade(targetId, transferTo);
        return c.json({ success: true });
    } catch (err) {
        console.error('[admin/users DELETE] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

router.post('/admin/users/:id/resend-invite', async (c) => {
    const adminId = await requireAdmin(c);
    if (!adminId) return c.json({ error: 'Admin access required' }, 403);
    try {
        const targetId = c.req.param('id');
        const target = await getUser(targetId);
        if (!target) return c.json({ error: 'User not found' }, 404);
        const { token, expiresAt } = await regenerateInviteToken(targetId);
        return c.json({ success: true, inviteToken: token, expiresAt });
    } catch (err: any) {
        console.error('[admin/users resend-invite] error:', err);
        return c.json({ error: err?.message || 'Internal server error' }, 400);
    }
});

router.post('/admin/users/:id/reset-link', async (c) => {
    const adminId = await requireAdmin(c);
    if (!adminId) return c.json({ error: 'Admin access required' }, 403);
    try {
        const targetId = c.req.param('id');
        const target = await getUser(targetId);
        if (!target) return c.json({ error: 'User not found' }, 404);
        const { token, expiresAt } = await generateResetLink(targetId);
        return c.json({ success: true, inviteToken: token, expiresAt });
    } catch (err) {
        console.error('[admin/users reset-link] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── Admin settings ───────────────────────────────────────────────────────────

router.get('/admin/settings', async (c) => {
    const adminId = await requireAdmin(c);
    if (!adminId) return c.json({ error: 'Admin access required' }, 403);
    try {
        const entries = await Promise.all(
            ADMIN_SETTING_KEYS.map(async (k) => [k, await getAppSetting(k)] as const),
        );
        const settings: Record<string, any> = {};
        for (const [k, v] of entries) settings[k] = v;
        return c.json({ settings });
    } catch (err) {
        console.error('[admin/settings GET] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

router.patch('/admin/settings', async (c) => {
    const adminId = await requireAdmin(c);
    if (!adminId) return c.json({ error: 'Admin access required' }, 403);
    try {
        const body = await c.req.json().catch(() => ({}));
        if (!body || typeof body !== 'object') {
            return c.json({ error: 'Body must be a JSON object of key→value' }, 400);
        }
        for (const k of Object.keys(body)) {
            if (!isAdminSettingKey(k)) {
                return c.json({ error: `Unknown setting: ${k}` }, 400);
            }
            await setAppSetting(k, body[k]);
        }
        return c.json({ success: true });
    } catch (err) {
        console.error('[admin/settings PATCH] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── Public-facing branding flags ─────────────────────────────────────────────
// Used by the frontend to decide whether to show "Powered by 0colors" footer
// and the configured instance name. No auth required (the values are visible
// to anyone who hits the SPA anyway).

router.get('/public-settings', async (c) => {
    try {
        const [instanceName, attribution] = await Promise.all([
            getAppSetting('instance_name'),
            getAppSetting('attribution_enabled'),
        ]);
        return c.json({
            instanceName: typeof instanceName === 'string' ? instanceName : '0colors',
            attributionEnabled: attribution === undefined || attribution === null ? true : attribution !== false,
        });
    } catch (err) {
        console.error('[public-settings] error:', err);
        return c.json({ instanceName: '0colors', attributionEnabled: true });
    }
});

// ── Dev-only debug routes ────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
    router.get('/debug-auth', async (c) => {
        try {
            const userId = await requireAdmin(c);
            if (!userId) return c.json({ error: 'Admin access required' }, 403);
            const admin = await isAdmin(userId);
            return c.json({ success: true, userId, isAdmin: admin });
        } catch (err: any) {
            return c.json({ error: err?.message || 'Internal server error' }, 500);
        }
    });

    router.get('/debug-cloud-state/:userId', async (c) => {
        try {
            const adminId = await requireAdmin(c);
            if (!adminId) return c.json({ error: 'Admin access required' }, 403);
            const targetUserId = c.req.param('userId');
            const targetUser = await getUser(targetUserId);
            const meta = normalizeUserToMeta(targetUser);
            const admin = await isAdmin(targetUserId);
            const projectIds: string[] = meta.cloudProjectIds;
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
                    };
                });
            }
            return c.json({ success: true, targetUserId, meta, isAdmin: admin, projectCount: projectIds.length, projects });
        } catch (err: any) {
            return c.json({ error: err?.message || 'Internal server error' }, 500);
        }
    });
}

export default router;
