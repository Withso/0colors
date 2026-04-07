# 0colors

Full-stack monorepo with npm workspaces.

## Structure

- `packages/backend/` — Backend service
- `packages/frontend/` — Frontend app (Vite + React)

## Commands

- `npm run dev` — Start both backend and frontend in dev mode
- `npm run dev:qa` — Same as `dev` plus local QA runner (`qa:runner` on `127.0.0.1:47841`) for QA hub “Run all tests”
- `npm run dev:frontend` — Frontend only
- `npm run dev:backend` — Backend only
- `npm run build` — Build all workspaces
- `npm run typecheck` — Run TypeScript type checking

## Conventions

- Node.js >= 20
- TypeScript throughout
- Workspaces: `@0colors/backend`, `@0colors/frontend`
