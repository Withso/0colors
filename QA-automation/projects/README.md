# Per-product test packages

| Folder | Product |
|--------|---------|
| `0colors/` | This monorepo (Vite app on port 3000) |
| `_template/` | Copy to bootstrap a new `projects/<name>/` |

Each product should include:

- `meta.ts` — DOM selectors for “app ready” (and optional loading overlay).
- `tests/*.spec.ts` — Playwright tests.
- Optional `MANUAL-TEST-CASES.md` — human-run scenarios.
