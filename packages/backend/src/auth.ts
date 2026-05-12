// ============================================================================
// Request-level auth contract.
//
// Resolves the signed-in user from the session cookie (set by routes/auth.ts).
// Routes call requireAuth/requireAdmin (in middleware/auth.ts) which delegate
// here. Returning null means "no valid session" — middleware turns that into
// a 401.
// ============================================================================

import type { Context } from 'hono';
import { getUser, getAuthSession, touchAuthSession } from './db.js';
import { readSessionCookie } from './auth-helpers.js';

/** Resolve { userId } from the session cookie, or null if not authenticated. */
export async function getAuthUser(c: Context): Promise<{ userId: string } | null> {
    const sessionId = readSessionCookie(c);
    if (!sessionId) return null;

    const session = await getAuthSession(sessionId);
    if (!session) return null;

    // Update last_seen_at in the background — non-blocking, non-fatal.
    touchAuthSession(sessionId).catch(() => {});

    return { userId: session.user_id };
}

/** Same as getAuthUser, with display name. Used by routes that stamp user_name on rows. */
export async function getAuthUserWithName(c: Context): Promise<{ userId: string; userName: string } | null> {
    const auth = await getAuthUser(c);
    if (!auth) return null;

    const user = await getUser(auth.userId);
    const userName = user?.name || user?.email || 'User';
    return { userId: auth.userId, userName };
}
