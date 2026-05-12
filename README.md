# 0colors

> A self-hosted, open-source design-tokens canvas. Build a color system on an infinite canvas, derive themes and tokens automatically, export to CSS / Tailwind / DTCG / Figma — all on your own Railway instance, no cloud account required.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/0colors)

## What you get

A single Railway service plus a Postgres plugin, both running on your account:

- **One service** — a Hono backend that serves the React SPA on `/` and the JSON API on `/api/*`. One domain, one TLS cert, no CORS surface.
- **Postgres plugin** — wired via `${{Postgres.DATABASE_URL}}`. Project snapshots, AI conversations, sessions, and community publications all live here.
- **First-user-becomes-admin** setup wizard, plus an invite flow for additional users.
- **Optional AI features** — Bring your own Anthropic, OpenAI, or OpenRouter key (any subset).
- **Local auth, no third-party identity provider** — bcrypt-hashed passwords, HttpOnly session cookies.

## Quick deploy

1. Click the **Deploy on Railway** button above.
2. The wizard provisions a Postgres plugin and the app service, wires `DATABASE_URL` automatically.
3. (Optional) Fill in `ADMIN_EMAIL` + `ADMIN_PASSWORD` to auto-create the admin on first boot. Leave blank to use the in-app setup wizard at first visit.
4. Open the deployed URL. Either the setup wizard renders (set the admin password), or you can sign in directly with the env-seeded credentials.

That's it. Invite teammates from **Profile → Invite a user**, share the generated link.

## Local development

Requirements: Node 20+, Postgres 14+.

```bash
# Clone and install
git clone https://github.com/YOUR_ORG/0colors.git
cd 0colors
npm install

# Configure
cp .env.example .env
# Edit .env — set DATABASE_URL at minimum

# Run schema migrations (idempotent)
npm run db:migrate -w @0colors/backend

# Start backend (Hono, port 4455) and frontend (Vite, port 3000) together
npm run dev
```

Visit <http://localhost:3000>. Vite proxies `/api/*` to the backend automatically.

Other useful commands:

| Command | What it does |
|---|---|
| `npm run dev:backend` | Backend only (with `tsx watch`) |
| `npm run dev:frontend` | Frontend only (Vite dev server) |
| `npm run build` | Build frontend → build backend → bundle SPA into the backend's `dist/public/` |
| `npm run start:backend` | Run the production build locally |
| `npm run typecheck` | TypeScript check on the backend |

## Configuration

The full env-var reference lives in [.env.example](.env.example). Highlights:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. On Railway, wired automatically. |
| `PORT` | no | Railway injects this. Defaults to `4455` locally. |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | no | If both are set AND no user has activated yet, the admin is seeded on first boot (skips the setup wizard). |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | no | Each independent; unset = that AI option is disabled. |
| `FIGMA_WEBHOOK_SECRET` | no | Required only if you wire Figma → 0colors webhooks. |
| `CRON_SECRET` | no | Required only if you use the cron endpoints. On Railway, generate with `${{ secret(32) }}`. |
| `VITE_API_BASE_URL` | no | Only needed if the SPA is served from a different origin than the API. Default: same-origin `/api`. |

## How it's deployed

```
┌───────────────────────────────────────────────────┐
│  Railway project                                  │
│                                                   │
│  ┌─────────────────────┐    ┌──────────────────┐  │
│  │  0colors (app)      │◀──▶│  Postgres        │  │
│  │  • /api/*  JSON     │    │  (Railway plugin)│  │
│  │  • /       SPA      │    │  Auto-backups    │  │
│  │  $PORT, /api/health │    └──────────────────┘  │
│  └─────────────────────┘                          │
│           ▲                                       │
│           │   *.up.railway.app + custom domain    │
└───────────┼───────────────────────────────────────┘
            │
       Your browser
```

- `railway.json` declares the Dockerfile builder, `preDeployCommand` (runs `db:migrate` in a separate container), healthcheck on `/api/health`, `ON_FAILURE` restart policy.
- The repo-root `Dockerfile` is a single-stage `node:20-alpine` image: `COPY .`, `npm ci --include=dev`, `npm run build`, `node packages/backend/dist/server.js`.
- The build pipeline runs `vite build` first, then the backend's `tsc + bundle:spa` step copies `packages/frontend/build/` into `packages/backend/dist/public/`. The Hono server mounts that directory for static asset serving and falls back to `index.html` for any unmatched non-`/api` route (so client-side routes survive hard refresh).

## API documentation

Most endpoints are gated by the session cookie set during sign-in. Highlights, including how to script invites without the UI, are in [docs/api.md](docs/api.md).

## Telemetry

**None.** 0colors collects nothing about your install, your users, or your designs. If telemetry ever lands, it will be opt-in and documented here.

## Security

Local cookie-based sessions, bcrypt-hashed passwords, server-side session revocation, CSRF protection via `SameSite=Lax`. Full notes: [SECURITY.md](SECURITY.md). Found something? Email the maintainer (see SECURITY.md) — please don't open a public issue for unpatched vulnerabilities.

## Contributing

PRs welcome. Quick checklist:

- Read [RULES.md](RULES.md) for the in-repo conventions (file layout, page structure, state management patterns).
- Run `npm run typecheck` and `npm run build` before opening a PR.
- Keep schema changes idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`) — `db:migrate` re-runs on every deploy.

## License

[MIT](LICENSE) — fork it, ship it, modify it. Attribution appreciated but not required.
