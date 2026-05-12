// ============================================================================
// Auth contract — Phase 1 placeholder.
//
// Until Phase 2 lands real local auth (setup wizard, bcrypt passwords, session
// cookies), every request resolves to a fixed local admin. This preserves the
// `requireAuth` contract so all routes keep working end-to-end during the
// transition. Phase 2 replaces the body of getAuthUser() with real cookie /
// JWT verification against the local users table.
// ============================================================================

import type { Context } from 'hono';

export const PLACEHOLDER_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000001';
const PLACEHOLDER_ADMIN_NAME = 'Local Admin';

/** Extract auth context. Phase 1: always returns the placeholder admin. */
export async function getAuthUser(_c: Context): Promise<{ userId: string } | null> {
    return { userId: PLACEHOLDER_ADMIN_USER_ID };
}

/** Same as getAuthUser, with display name. Phase 1: always placeholder admin. */
export async function getAuthUserWithName(_c: Context): Promise<{ userId: string; userName: string } | null> {
    return { userId: PLACEHOLDER_ADMIN_USER_ID, userName: PLACEHOLDER_ADMIN_NAME };
}
