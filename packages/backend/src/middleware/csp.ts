// ============================================
// MIDDLEWARE: Content Security Policy
//
// Adds a `Content-Security-Policy` or `Content-Security-Policy-Report-Only`
// header to every response. Defaults to report-only so the rollout can be
// observed in browser consoles before flipping to enforcement.
//
// Flip to enforcement by setting CSP_ENFORCE=1 in the environment.
// Tweak directives below as third-party resources are added.
// ============================================

import type { MiddlewareHandler } from 'hono';

const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts-api.zeros.design https://accounts.zeros.design https://api-server-production-0064.up.railway.app https://api.anthropic.com https://api.openai.com https://openrouter.ai",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

export function csp(): MiddlewareHandler {
    const enforce = process.env.CSP_ENFORCE === '1';
    const headerName = enforce
        ? 'Content-Security-Policy'
        : 'Content-Security-Policy-Report-Only';

    return async (c, next) => {
        await next();
        c.header(headerName, directives);
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        c.header('X-Frame-Options', 'DENY');
    };
}
