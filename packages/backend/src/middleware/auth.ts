// ===========================================================================
//  Auth Middleware & Helpers
// ===========================================================================

import { getAuthUser } from '../auth.js';
import { kvGet } from '../db.js';

/** Require auth and return userId, or short-circuit the response */
export async function requireAuth(c: any): Promise<string | null> {
    const user = await getAuthUser(c);
    if (!user) {
        c.status(401);
        return null;
    }
    return user.userId;
}

/** Check if a user is an admin (handles JSONB variations) */
export async function isAdmin(userId: string): Promise<boolean> {
    const val = await kvGet(`user:admin:${userId}`);
    return val === true || val === 'true' || String(val) === 'true';
}

/** Check if a user is the template admin (must be admin first) */
export async function isTemplateAdmin(userId: string): Promise<boolean> {
    const admin = await isAdmin(userId);
    if (!admin) return false;
    const templateAdminId = await kvGet('app:template_admin_user_id');
    // Strip surrounding quotes from JSONB string values
    return templateAdminId != null && String(templateAdminId).replace(/^"|"$/g, '') === userId;
}

/** Get user role string */
export async function getUserRole(userId: string): Promise<'admin' | 'user'> {
    const admin = await isAdmin(userId);
    return admin ? 'admin' : 'user';
}

/** Require admin role, return userId or null */
export async function requireAdmin(c: any): Promise<string | null> {
    const userId = await requireAuth(c);
    if (!userId) return null;
    const admin = await isAdmin(userId);
    if (!admin) {
        c.status(403);
        return null;
    }
    return userId;
}

/** Normalize user meta to handle legacy field names (cloudProjectsList → cloudProjectIds) */
export function normalizeMeta(meta: any): any {
    if (!meta) return { cloudProjectIds: [] };
    const cloudProjectIds = meta.cloudProjectIds || meta.cloudProjectsList || meta.cloudProjects || [];
    meta.cloudProjectIds = cloudProjectIds;
    delete meta.cloudProjectsList;
    delete meta.cloudProjects;
    return meta;
}
