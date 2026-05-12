// ===========================================================================
//  Rate Limiter (in-memory)
// ===========================================================================

import type { Context } from 'hono';
import { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } from '../constants.js';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
    /** Override the rolling window (ms). Defaults to RATE_LIMIT_WINDOW_MS. */
    windowMs?: number;
    /** Override the cap. Defaults to RATE_LIMIT_MAX. */
    max?: number;
}

export function checkRateLimit(
    key: string,
    opts: RateLimitOptions = {},
): { allowed: boolean; remaining: number; resetAt: number } {
    const windowMs = opts.windowMs ?? RATE_LIMIT_WINDOW_MS;
    const max = opts.max ?? RATE_LIMIT_MAX;
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now >= entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
    }

    if (entry.count >= max) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

/** Extract the requesting client's IP. Honors X-Forwarded-For when Railway sits in front. */
export function getClientIp(c: Context): string {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0]!.trim();
    const real = c.req.header('x-real-ip');
    if (real) return real.trim();
    return 'unknown';
}

// Periodically clean up expired rate limit entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
        if (now >= entry.resetAt) rateLimitMap.delete(key);
    }
}, 10 * 60 * 1000); // every 10 minutes
