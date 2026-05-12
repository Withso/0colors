// ============================================================================
// /api/branding/* — runtime branding endpoints.
//
// Phase 7 stub: returns the static default assets baked into the build.
// Phase 8 will add an admin upload flow that stores base64 in app_settings;
// when an upload is present, this endpoint serves that instead. The
// frontend's index.html references `/api/branding/favicon` from day one so
// the runtime override works without an HTML rebuild.
// ============================================================================

import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAppSetting } from '../db.js';

const router = new Hono();

// Resolves to packages/backend/dist/public/ at runtime (same dir Hono's
// serveStatic mounts in server.ts). __dirname here is dist/routes/.
const STATIC_DIR = join(__dirname, '..', 'public');

const FAVICON_FALLBACK = 'favicon.svg';
const LOGO_FALLBACK = 'logo.svg';

interface BrandingBlob {
    /** Base64-encoded file contents (no data: prefix). */
    data: string;
    /** MIME type, e.g. image/png, image/svg+xml. */
    contentType: string;
}

function isBrandingBlob(v: any): v is BrandingBlob {
    return v && typeof v.data === 'string' && typeof v.contentType === 'string';
}

async function serveBranding(c: any, settingKey: string, fallbackFile: string, fallbackMime: string) {
    try {
        const stored = await getAppSetting(settingKey);
        if (isBrandingBlob(stored)) {
            c.header('Content-Type', stored.contentType);
            c.header('Cache-Control', 'public, max-age=3600');
            return c.body(Buffer.from(stored.data, 'base64'));
        }
    } catch (err) {
        // Fall through to the static default.
        console.warn(`[branding] failed to read ${settingKey}:`, err);
    }

    const fallbackPath = join(STATIC_DIR, fallbackFile);
    if (!existsSync(fallbackPath)) {
        return c.json({ error: 'No branding asset available' }, 404);
    }
    c.header('Content-Type', fallbackMime);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(readFileSync(fallbackPath));
}

router.get('/branding/favicon', (c) =>
    serveBranding(c, 'branding_favicon', FAVICON_FALLBACK, 'image/svg+xml'),
);

router.get('/branding/logo', (c) =>
    serveBranding(c, 'branding_logo', LOGO_FALLBACK, 'image/svg+xml'),
);

export default router;
