# Security — 0colors

This document covers the security model of the self-hosted Railway template
and lists the known hardenings and gaps you should be aware of before
running 0colors in production.

## Threat model in scope

0colors is designed for **small-team self-hosting** — one admin, a handful of
invited collaborators, deployed behind Railway's TLS termination on a domain
you control. It is *not* designed to be a public multi-tenant SaaS.

## Authentication

- **Local users only.** No third-party identity provider, no email/password
  reset by email (admin can reissue an invite instead). Email + bcrypt
  password is the only auth path.
- **Passwords** are hashed with bcrypt (cost factor 10). Hashes are never
  returned by any API.
- **Sessions** are random 32-byte URL-safe ids stored in a dedicated
  `auth_sessions` table with `expires_at` (30 days, rolling on activity).
  Logout removes the row server-side; "log out everywhere" is a single
  DELETE on `auth_sessions WHERE user_id = …` (used internally by the
  password-change path).
- **Session cookie** is `HttpOnly`, `SameSite=Lax`, `Secure` whenever the
  request arrives over HTTPS (Railway's `x-forwarded-proto` header is
  trusted). Path is `/`.
- **Setup wizard** is gated on `countActivatedUsers() === 0`. Any subsequent
  `POST /api/auth/setup` returns 409, so an attacker can't re-trigger first-
  run flow even if they discover the endpoint.
- **Invite tokens** are random 24-byte URL-safe ids with a 7-day expiry.
  Tokens are cleared on first acceptance — replaying a used invite returns
  `valid: false`.

## CSRF

Cookies are `SameSite=Lax`, which blocks cross-site `POST` forms by default.
In the single-service deployment (the default), the SPA and API share an
origin so the cookie travels naturally on same-origin requests and no
explicit CSRF token is needed. If you put the SPA on a separate origin from
the API, you'll need to add a CSRF token layer — `SameSite=Lax` is no longer
sufficient for cross-origin POSTs.

## CSP

The backend ships a Content-Security-Policy in **report-only** mode by
default. Flip it to enforcement by setting `CSP_ENFORCE=1`. The current
directives are tight — no `*.supabase.co` or `accounts.zeros.design` leftovers
from the pre-OSS cloud era. If you add a new third-party service (Sentry,
PostHog, etc.), extend `packages/backend/src/middleware/csp.ts` accordingly.

## Multi-user / authorization

- `users.is_admin` gates admin-only routes (`/api/auth/invite`, template
  feature toggles, admin debug endpoints).
- Project ownership is enforced at the application layer: every read/write
  checks `owner_id === userId`.
- The session lock subsystem prevents two browser tabs from clobbering each
  other's edits.

## Known gaps (acceptable for v1, worth knowing)

- **No rate limiting on `/api/auth/login`.** A determined attacker can
  enumerate passwords. If you expose your instance publicly, put it behind
  Cloudflare or set up Railway's edge rate limits. We may add an in-app
  limiter later.
- **No email verification.** Admins create users via invite; we trust the
  admin to send the link only to the intended recipient.
- **No password-reset flow.** If a user forgets their password, the admin
  reissues an invite (`POST /api/auth/invite` with the same email) — this
  works because the row's `password_hash` only gets overwritten on accept,
  and the new invite supersedes any existing one.
- **No SCIM / SSO.** Out of scope for v1.
- **`vite build` outputs require `'unsafe-inline' 'unsafe-eval'` in
  `script-src`.** Tighten with hashes/nonces if your threat model demands it.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-impacting bugs.
Email <nisha.krishnan@zohocorp.com> with details and we'll coordinate a fix
and disclosure. A maintainer reply within 7 days is expected.
