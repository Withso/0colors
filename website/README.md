# 0colors marketing site

Static one-pager for 0colors.dev. No build step — just HTML, CSS, and a small JS file.

## Local preview

```bash
cd website
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (Cloudflare Pages)

Point the project's build root at `/website`. No build command, no output directory — Pages serves the folder as-is.

```
Root directory:    /website
Build command:     (none)
Output directory:  (same as root)
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All 10 sections, all copy |
| `styles.css` | Design tokens, layout, nav, buttons, type |
| `previews.css` | Hand-crafted product-UI preview mockups |
| `script.js` | Sticky nav, code-tab switch, copy button, scroll-fade |
| `assets/logo.svg` | Brand mark (mirror of `packages/frontend/public/logo.svg`) |
| `assets/favicon.svg` | Favicon |
| `assets/og-image.svg` | 1200×630 social card |
| `_headers` | Cloudflare Pages cache + security headers |

## Updating the design system

Tokens (colors, type, radius) are defined at the top of `styles.css` and mirror `packages/frontend/src/styles/variables.css`. If the app's tokens change, sync the matching `--bg-*`, `--fg-*`, `--accent`, etc. values.
