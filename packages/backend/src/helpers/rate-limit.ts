// ===========================================================================
//  Rate Limiter (in-memory)
// ===========================================================================

import { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } from '../constants.js';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now >= entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt };
}

// Periodically clean up expired rate limit entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
        if (now >= entry.resetAt) rateLimitMap.delete(key);
    }
}, 10 * 60 * 1000); // every 10 minutes
