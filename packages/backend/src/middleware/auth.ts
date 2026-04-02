// ===========================================================================
//  Auth Middleware & Helpers
// ===========================================================================

import { getAuthUser } from '../auth.js';
import { getUser, isUserAdmin, getAppSetting } from '../db.js';

/** Require auth and return userId, or short-circuit the response */
export async function requireAuth(c: any): Promise<string | null> {
    const user = await getAuthUser(c);
    if (!user) {
        c.status(401);
        return null;
    }
    return user.userId;
}

/** Check if a user is an admin */
export async function isAdmin(userId: string): Promise<boolean> {
    return isUserAdmin(userId);
}

/** Check if a user is the template admin (must be admin first) */
export async function isTemplateAdmin(userId: string): Promise<boolean> {
    const admin = await isUserAdmin(userId);
    if (!admin) return false;
    const templateAdminId = await getAppSetting('template_admin_user_id');
    return templateAdminId != null && String(templateAdminId).replace(/^"|"$/g, '') === userId;
}

/** Get user role string */
export async function getUserRole(userId: string): Promise<'admin' | 'user'> {
    const admin = await isUserAdmin(userId);
    return admin ? 'admin' : 'user';
}

/** Require admin role, return userId or null */
export async function requireAdmin(c: any): Promise<string | null> {
    const userId = await requireAuth(c);
    if (!userId) return null;
    const admin = await isUserAdmin(userId);
    if (!admin) {
        c.status(403);
        return null;
    }
    return userId;
}

/** Normalize user row to the meta format routes expect */
export function normalizeUserToMeta(user: any): any {
    if (!user) return { cloudProjectIds: [] };
    return {
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.created_at instanceof Date ? user.created_at.getTime() : user.created_at,
        cloudProjectIds: user.cloud_project_ids || [],
    };
}
