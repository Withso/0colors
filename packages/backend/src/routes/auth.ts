// ============================================================================
// Local auth routes (Phase 2 of the OSS pivot).
//
// Endpoints:
//   GET    /api/auth/setup-status        - is the install initialized?
//   POST   /api/auth/setup               - create the first admin (only if empty)
//   POST   /api/auth/login               - email + password -> session cookie
//   POST   /api/auth/logout              - delete session row, clear cookie
//   GET    /api/auth/me                  - current user (null if not signed in)
//   POST   /api/auth/invite              - admin-only: create pending user
//   GET    /api/auth/invite/:token       - lookup invite for accept-invite form
//   POST   /api/auth/accept-invite       - set password, activate user, sign in
// ============================================================================

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import {
    countActivatedUsers, createUser, createInvitedUser, getUser, getUserByEmail,
    getUserByInviteToken, setUserPassword, createAuthSession, deleteAuthSession,
    purgeExpiredAuthSessions, getAppSetting,
} from '../db.js';
import { getAuthUser } from '../auth.js';
import { requireAdmin, normalizeUserToMeta } from '../middleware/auth.js';
import {
    hashPassword, verifyPassword, generateToken, readSessionCookie,
    writeSessionCookie, clearSessionCookie, getUserAgent,
    SESSION_TTL_MS, INVITE_TTL_MS,
} from '../auth-helpers.js';

const router = new Hono();
const MIN_PASSWORD_LENGTH = 8;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(s: unknown): s is string {
    return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isValidPassword(s: unknown): s is string {
    return typeof s === 'string' && s.length >= MIN_PASSWORD_LENGTH;
}

async function startSession(c: any, userId: string) {
    const sessionId = generateToken(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await createAuthSession({
        id: sessionId,
        userId,
        expiresAt,
        userAgent: getUserAgent(c),
    });
    writeSessionCookie(c, sessionId);
}

// ── GET /api/auth/setup-status ───────────────────────────────────────────────

router.get('/auth/setup-status', async (c) => {
    try {
        const activated = await countActivatedUsers();
        return c.json({ isSetupComplete: activated > 0 });
    } catch (err) {
        console.error('[auth/setup-status] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── POST /api/auth/setup ─────────────────────────────────────────────────────
// Only callable while the install has zero activated users.

router.post('/auth/setup', async (c) => {
    try {
        const activated = await countActivatedUsers();
        if (activated > 0) {
            return c.json({ error: 'Setup already complete' }, 409);
        }

        const body = await c.req.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';

        if (!isValidEmail(email)) return c.json({ error: 'A valid email is required' }, 400);
        if (!isValidPassword(password)) {
            return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
        }
        if (!name) return c.json({ error: 'Name is required' }, 400);

        const userId = randomUUID();
        const passwordHash = await hashPassword(password);

        await createUser(userId, {
            email,
            name,
            role: 'admin',
            is_admin: true,
            cloud_project_ids: [],
        });
        await setUserPassword(userId, passwordHash);

        await startSession(c, userId);

        return c.json({
            success: true,
            user: { id: userId, email, name, isAdmin: true },
        });
    } catch (err: any) {
        console.error('[auth/setup] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── GET /api/auth/signup-status ──────────────────────────────────────────────
// Public. Tells the login screen whether to render a "Sign up" link.

router.get('/auth/signup-status', async (c) => {
    try {
        const setting = await getAppSetting('allow_public_signup');
        // Default ON: missing setting (fresh install) treats as enabled.
        const allowed = setting === null || setting === undefined || setting === true;
        return c.json({ allowPublicSignup: allowed });
    } catch (err) {
        console.error('[auth/signup-status] error:', err);
        return c.json({ allowPublicSignup: false }, 500);
    }
});

// ── POST /api/auth/signup ────────────────────────────────────────────────────
// Public — but only when allow_public_signup is true (the default).
// First-ever signup on a fresh install routes through /api/auth/setup instead,
// which creates an admin. This endpoint always creates a regular user.

router.post('/auth/signup', async (c) => {
    try {
        const setting = await getAppSetting('allow_public_signup');
        const allowed = setting === null || setting === undefined || setting === true;
        if (!allowed) {
            return c.json({ error: 'Public signup is disabled on this install' }, 403);
        }

        const body = await c.req.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';

        if (!isValidEmail(email)) return c.json({ error: 'A valid email is required' }, 400);
        if (!isValidPassword(password)) {
            return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
        }
        if (!name) return c.json({ error: 'Name is required' }, 400);

        const existing = await getUserByEmail(email);
        if (existing) {
            // If the user exists but hasn't activated (pending invite), treat the
            // signup as an accept-with-fresh-password. Otherwise reject.
            if (existing.password_hash) {
                return c.json({ error: 'An account with this email already exists' }, 409);
            }
            const passwordHash = await hashPassword(password);
            await setUserPassword(existing.id, passwordHash);
            await startSession(c, existing.id);
            return c.json({
                success: true,
                user: { id: existing.id, email: existing.email, name: existing.name, isAdmin: existing.is_admin },
            });
        }

        const userId = randomUUID();
        const passwordHash = await hashPassword(password);

        await createUser(userId, {
            email,
            name,
            role: 'user',
            is_admin: false,
            cloud_project_ids: [],
        });
        await setUserPassword(userId, passwordHash);

        await startSession(c, userId);

        return c.json({
            success: true,
            user: { id: userId, email, name, isAdmin: false },
        });
    } catch (err) {
        console.error('[auth/signup] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/auth/login', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!email || !password) {
            return c.json({ error: 'Email and password are required' }, 400);
        }

        const user = await getUserByEmail(email);
        // Constant-ish failure response: same message regardless of which side
        // failed, to avoid leaking which emails are registered.
        const invalid = () => c.json({ error: 'Invalid email or password' }, 401);

        if (!user || !user.password_hash) return invalid();
        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) return invalid();
        if (!user.is_active) return c.json({ error: 'Account is deactivated. Contact an admin.' }, 403);

        await startSession(c, user.id);
        // Opportunistic cleanup — cheap on a small users table.
        purgeExpiredAuthSessions().catch(() => {});

        return c.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin },
        });
    } catch (err) {
        console.error('[auth/login] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/auth/logout', async (c) => {
    try {
        const sessionId = readSessionCookie(c);
        if (sessionId) await deleteAuthSession(sessionId);
        clearSessionCookie(c);
        return c.json({ success: true });
    } catch (err) {
        console.error('[auth/logout] error:', err);
        // Still clear the cookie so the client recovers.
        clearSessionCookie(c);
        return c.json({ success: true });
    }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
// Always returns 200 with { user: null } when not signed in (instead of 401)
// so the frontend has a single happy path: fetch, check user, branch.

router.get('/auth/me', async (c) => {
    try {
        const auth = await getAuthUser(c);
        if (!auth) return c.json({ user: null });

        const user = await getUser(auth.userId);
        if (!user) return c.json({ user: null });

        return c.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.is_admin,
                meta: normalizeUserToMeta(user),
            },
        });
    } catch (err) {
        console.error('[auth/me] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── POST /api/auth/invite ────────────────────────────────────────────────────

router.post('/auth/invite', async (c) => {
    try {
        const inviterId = await requireAdmin(c);
        if (!inviterId) return c.json({ error: 'Forbidden' }, 403);

        const body = await c.req.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const isAdmin = body.isAdmin === true;

        if (!isValidEmail(email)) return c.json({ error: 'A valid email is required' }, 400);
        if (!name) return c.json({ error: 'Name is required' }, 400);

        const existing = await getUserByEmail(email);
        if (existing) {
            // If the user already exists but hasn't accepted yet, reissue token.
            // If they have a password, the invite is rejected — admin should ask
            // them to use password reset instead (out of scope for v1).
            if (existing.password_hash) {
                return c.json({ error: 'A user with that email already exists' }, 409);
            }
            const token = generateToken(24);
            const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
            await createInvitedUser({
                // Re-using the same id replaces the row via the ON CONFLICT
                // path on createUser — but here we want to update token only.
                id: existing.id,
                email,
                name,
                inviteToken: token,
                inviteExpiresAt: expiresAt,
                invitedBy: inviterId,
                is_admin: isAdmin,
            }).catch(async () => {
                // Existing row collided. Update its invite fields instead.
                const { pool } = await import('../db.js');
                await pool.query(
                    `UPDATE users SET name = $1, invite_token = $2, invite_expires_at = $3,
                                       invited_by = $4, is_admin = $5, role = $6, updated_at = NOW()
                     WHERE id = $7`,
                    [name, token, expiresAt, inviterId, isAdmin, isAdmin ? 'admin' : 'user', existing.id]
                );
            });
            return c.json({ success: true, inviteToken: token, userId: existing.id, expiresAt });
        }

        const userId = randomUUID();
        const token = generateToken(24);
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

        await createInvitedUser({
            id: userId,
            email,
            name,
            inviteToken: token,
            inviteExpiresAt: expiresAt,
            invitedBy: inviterId,
            is_admin: isAdmin,
        });

        return c.json({ success: true, inviteToken: token, userId, expiresAt });
    } catch (err) {
        console.error('[auth/invite] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── GET /api/auth/invite/:token ──────────────────────────────────────────────
// Public lookup. Returns email + name + expiry so the accept-invite UI can
// confirm "you were invited as <email>" before asking for a password.

router.get('/auth/invite/:token', async (c) => {
    try {
        const token = c.req.param('token');
        const user = await getUserByInviteToken(token);

        if (!user || !user.invite_token || !user.invite_expires_at) {
            return c.json({ valid: false, reason: 'unknown' });
        }
        if (new Date(user.invite_expires_at).getTime() < Date.now()) {
            return c.json({ valid: false, reason: 'expired' });
        }
        if (user.password_hash) {
            return c.json({ valid: false, reason: 'already-activated' });
        }

        return c.json({
            valid: true,
            email: user.email,
            name: user.name,
            expiresAt: user.invite_expires_at,
        });
    } catch (err) {
        console.error('[auth/invite-lookup] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// ── POST /api/auth/accept-invite ─────────────────────────────────────────────

router.post('/auth/accept-invite', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({}));
        const token = typeof body.token === 'string' ? body.token : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!token) return c.json({ error: 'Invite token is required' }, 400);
        if (!isValidPassword(password)) {
            return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
        }

        const user = await getUserByInviteToken(token);
        if (!user || !user.invite_token || !user.invite_expires_at) {
            return c.json({ error: 'Invalid or expired invite' }, 400);
        }
        if (new Date(user.invite_expires_at).getTime() < Date.now()) {
            return c.json({ error: 'Invite has expired' }, 400);
        }
        if (user.password_hash) {
            return c.json({ error: 'Invite has already been accepted' }, 409);
        }

        const passwordHash = await hashPassword(password);
        await setUserPassword(user.id, passwordHash); // also clears invite_token

        await startSession(c, user.id);

        return c.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin },
        });
    } catch (err) {
        console.error('[auth/accept-invite] error:', err);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

export default router;
