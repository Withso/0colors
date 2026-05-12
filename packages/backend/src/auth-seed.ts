// ============================================================================
// Optional first-boot admin seed.
//
// If ADMIN_EMAIL + ADMIN_PASSWORD are present at startup AND no users have yet
// activated their account, we provision the admin row automatically so the
// operator can deploy → log in immediately without going through the setup
// wizard. Useful for power users; the wizard remains the default path.
//
// Idempotent: runs every boot, becomes a no-op once any user is activated.
// Safe to remove the env vars after the first successful boot.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { countActivatedUsers, createUser, setUserPassword } from './db.js';
import { hashPassword } from './auth-helpers.js';

export async function maybeSeedAdminFromEnv(): Promise<void> {
    const email = (process.env.ADMIN_EMAIL ?? '').trim();
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (!email || !password) return;

    // Skip if anyone has already activated — the seed only helps on a truly
    // fresh install. (Avoids accidentally re-seeding after env vars are left
    // in place across redeploys.)
    const activated = await countActivatedUsers();
    if (activated > 0) return;

    if (password.length < 8) {
        console.warn('[auth-seed] ADMIN_PASSWORD is shorter than 8 characters — skipping seed');
        return;
    }

    const userId = randomUUID();
    const name = email.split('@')[0] || 'Admin';
    await createUser(userId, { email, name, role: 'admin', is_admin: true, cloud_project_ids: [] });
    await setUserPassword(userId, await hashPassword(password));

    console.log(`[auth-seed] Provisioned admin user from env: ${email}`);
}
