# Changelog

All notable changes to 0colors are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. Track the [main](https://github.com/Withso/0colors/commits/main) branch for in-progress work, or watch [Releases](https://github.com/Withso/0colors/releases) for the next tag.

---

## [1.1.0] — 2026-05-12

A maintenance release that turns the v1.0.0 Railway template from "works" into "works the way operators expect". No DB-incompatible changes — every schema migration is idempotent and runs automatically on deploy.

### Added

- **Admin Settings panel** in the sidebar (admin-only), with five tabs:
  - **Users** — list with status badge, three-dot menu per row (re-issue invite, generate password-reset link, promote/demote, deactivate, delete with project-transfer), inline invite form.
  - **Branding** — favicon + logo upload, "Powered by 0colors" toggle. Assets stored as base64 in the database so they survive Railway redeploys without a volume mount.
  - **General** — instance name, "Allow public signup" toggle.
  - **Email** — v1.2 placeholder (SMTP integration deferred).
  - **Security** — v1.2 placeholder (rate-limit settings display, audit log).
- **Public signup** at `/signup`, enabled by default. Admin can disable it from **Admin → General**.
- **Active sessions card** in Profile: see every device/browser you're signed in from, sign out per-session or "everywhere else" with one click. Powered by `GET/DELETE /api/auth/sessions` endpoints.
- **`GET /api/public-settings`** — unauthenticated endpoint returning the instance name and attribution flag so the SPA can render them.
- **`/api/branding/{favicon,logo}`** runtime endpoints — admin uploads are served live; fall back to the bundled defaults when no override is set.

### Changed

- **Rate-limited auth endpoints**: `/auth/login`, `/auth/signup`, `/auth/accept-invite` now return `429 Too Many Requests` with `Retry-After` after 5 attempts in 15 minutes per IP + identifier. `X-Forwarded-For` is honored.
- **Hourly auth-session janitor** runs in-process and purges expired rows. The opportunistic-on-login cleanup from v1.0 stays in parallel.
- **`Cache-Control` on the SPA**: hashed `/assets/*` are `public, max-age=31536000, immutable`; `index.html` and the SPA fallback are `no-cache`.
- **Auth screens** (Setup / Login / Signup / Accept-Invite) restyled against the real design tokens. Same surface treatment, radii, typography as the rest of the app.
- **Login** rejects deactivated users with `403 Account is deactivated`. Deactivation also kills all of the target's `auth_sessions`.
- **`InviteUserCard` moved** from Profile to the Admin → Users tab.

### Removed

- "Templates" admin feature: backend `routes/templates.ts`, the `useSampleTemplates` cloud-fetch, the "Star template" UI, `template_admin_user_id` / `starred_template_id` app-settings keys, and the `isTemplateAdmin` plumbing — they were cloud-product features that didn't fit single-team self-host.
- `/sample-project/*` routes and the auto-redirect to demo content for unauthenticated visitors.
- The "Sample Projects" section in the Projects page (was showing infinitely-loading skeleton placeholders).

### Security

- Brute-force protection on every public auth endpoint.
- Last-admin demotion guard: an admin can't demote themselves when no other active admins exist.
- Self-deactivation and self-deletion blocked.
- Per-session revocation surface in user Profile.

### Fixed

- `index.html` now declares a favicon `<link>` (previously the browser tab had no icon).
- Default deploy no longer shows a Templates admin section that didn't apply to self-host installs.
- Default deploy no longer redirects unauthenticated visitors to demo sample-projects.

### Deferred to v1.2

- In-app SMTP config + "Send test email"
- Audit log
- Rate-limit counter reset on successful authentication
- TOTP / 2FA

---

## [1.0.0] — 2026-05-12

First open-source release. Self-hosted, single-Railway-service design-tokens canvas. No cloud auth, no third-party identity provider, no telemetry.

### Added

- One Railway service (Hono backend serves `/api/*` + built React SPA on `/`) plus a Postgres plugin auto-wired via `${{Postgres.DATABASE_URL}}`.
- First-user-becomes-admin setup wizard, or zero-touch seed from `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars.
- Local cookie-based sessions, bcrypt-hashed passwords (cost factor 10), invite flow with 7-day token expiry, accept-invite flow.
- Idempotent schema migrations via `packages/backend/dist/cli/migrate.js`, wired as Railway's `preDeployCommand`.
- DB-pinging `/api/health` for the deploy healthcheck (returns `503` when Postgres is unreachable so Railway rolls back automatically).
- Optional AI features — Bring Your Own `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` (each independent; unset disables that provider).
- MIT license.
- "Deploy on Railway" button.

[Unreleased]: https://github.com/Withso/0colors/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Withso/0colors/releases/tag/v1.1.0
[1.0.0]: https://github.com/Withso/0colors/releases/tag/v1.0.0
