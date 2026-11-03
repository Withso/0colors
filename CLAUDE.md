# 0colors

A local-only playground for understanding color logic. Colors, palettes, mixes, contrast checks, semantic tokens and themes are nodes on a canvas, and every computed value can be explained. Everything runs in the browser; there is no server-side code.

## Structure

Single package at the repo root (no npm workspaces).

- `src/engine/` — pure TypeScript color logic: conversions, gamut mapping, contrast, mixing, the formula language, graph evaluation, palettes and exporters. No React and no DOM. Tests sit next to the sources as `*.test.ts`.
- `src/app/` — React UI: canvas, nodes, inspector, panels and the Zustand store.
- `src/styles/index.css` — Tailwind v4 entry point and the semantic CSS variables for the app chrome.
- `public/` — static files copied as-is into the build.
- `Dockerfile`, `Caddyfile`, `railway.json` — the maintainers' hosted deployment on Railway.

## Commands

- `npm run dev` — Vite dev server on http://localhost:3000
- `npm run build` — production build into `dist/`
- `npm run preview` — serve the production build locally
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm test` — Vitest unit tests
- `npm run check` — typecheck + tests + build; run it before committing

## Conventions

- Node.js >= 20.19. TypeScript strict mode throughout.
- Keep `src/engine` framework-free and covered by unit tests. UI code calls into the engine, never the other way round.
- All persistence is local (IndexedDB via `idb-keyval`). Never add a backend, database, accounts or telemetry unless explicitly asked.
- Styling: Tailwind v4 utilities backed by the semantic CSS variables in `src/styles/index.css`. Use tokens such as `bg-surface`, `text-fg` and `border-line`, never hard-coded hex values in UI chrome. User-defined colors are applied with inline styles.
- Deployment is the maintainers' hosted instance: a static Caddy container on Railway (healthcheck `/healthz`), built from `main`. This repo is not a self-hosting template — don't add Deploy-on-Railway buttons, templates or self-hosting docs.
