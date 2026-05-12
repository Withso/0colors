// ============================================================================
// Local auth primitives: password hashing, session id generation, cookie I/O.
//
// Kept separate from auth.ts (the request-level getAuthUser contract) so route
// handlers can compose these without pulling the whole middleware surface.
// ============================================================================

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

// ── Constants ────────────────────────────────────────────────────────────────

export const SESSION_COOKIE_NAME = '0colors_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const BCRYPT_COST = 10;

// ── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
}

// ── Random token generation ──────────────────────────────────────────────────

/** Cryptographically strong, URL-safe id. Used for sessions and invites. */
export function generateToken(byteLength = 32): string {
    return randomBytes(byteLength).toString('base64url');
}

// ── Cookie I/O ───────────────────────────────────────────────────────────────

export function readSessionCookie(c: Context): string | null {
    return getCookie(c, SESSION_COOKIE_NAME) ?? null;
}

export function writeSessionCookie(c: Context, sessionId: string): void {
    const secure = isSecureRequest(c);
    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: SESSION_TTL_MS / 1000, // seconds
    });
}

export function clearSessionCookie(c: Context): void {
    const secure = isSecureRequest(c);
    deleteCookie(c, SESSION_COOKIE_NAME, {
        path: '/',
        secure,
        sameSite: 'Lax',
    });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSecureRequest(c: Context): boolean {
    // Trust the platform's proxy header in production (Railway terminates TLS).
    const proto = c.req.header('x-forwarded-proto');
    if (proto) return proto.split(',')[0].trim() === 'https';
    return process.env.NODE_ENV === 'production';
}

export function getUserAgent(c: Context): string | null {
    return c.req.header('user-agent') ?? null;
}
