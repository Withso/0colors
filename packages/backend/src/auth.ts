import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Extract and verify JWT from request headers */
export async function getAuthUser(c: Context): Promise<{ userId: string } | null> {
    try {
        const userToken = c.req.header('X-User-Token');
        const authHeader = c.req.header('Authorization');
        const accessToken = userToken || authHeader?.split(' ')[1];

        if (!accessToken) return null;

        const { data, error } = await supabase.auth.getUser(accessToken);
        if (error || !data?.user?.id) {
            if (error) console.error('[auth] Token verification failed:', error.message);
            return null;
        }

        return { userId: data.user.id };
    } catch (err) {
        console.error('[auth] getAuthUser unexpected error:', err);
        return null;
    }
}

/** Extract and verify JWT, returning userId + display name */
export async function getAuthUserWithName(c: Context): Promise<{ userId: string; userName: string } | null> {
    try {
        const userToken = c.req.header('X-User-Token');
        const authHeader = c.req.header('Authorization');
        const accessToken = userToken || authHeader?.split(' ')[1];

        if (!accessToken) return null;

        const { data, error } = await supabase.auth.getUser(accessToken);
        if (error || !data?.user?.id) {
            if (error) console.error('[auth] Token verification failed:', error.message);
            return null;
        }

        const userName = data.user.user_metadata?.name || data.user.email || 'Anonymous';
        return { userId: data.user.id, userName };
    } catch (err) {
        console.error('[auth] getAuthUserWithName unexpected error:', err);
        return null;
    }
}

/** Create a new user via Supabase Admin API */
export async function createUser(email: string, password: string, name: string) {
    try {
        return await supabase.auth.admin.createUser({
            email,
            password,
            user_metadata: { name: name || email.split('@')[0] },
            // email_confirm removed — verification emails are now sent via ZeptoMail SMTP
        });
    } catch (err) {
        console.error(`[auth] createUser failed for email="${email}":`, err);
        throw err;
    }
}
