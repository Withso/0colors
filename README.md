# 0colors

An open canvas for understanding color logic.

0colors lets you build a color system as a graph of nodes and see exactly how every color is computed: color spaces, inheritance, palettes, mixing, contrast, semantic tokens and light/dark themes. It opens on a sample canvas that uses every node type, with notes explaining each idea. Change something and watch the rest of the graph follow.

It runs entirely in your browser. Your work is saved locally in IndexedDB. There are no accounts, no backend and no telemetry.

## Nodes

| Node | What it does |
|---|---|
| **Color** | One color in OKLCH, HCT, HSL or RGB. Connect a parent and each channel can follow it. |
| **Palette** | Generates a scale of shades from a base color using a lightness curve, hue shift and chroma mode. Each shade has its own output. |
| **Mix** | Blends two colors in sRGB, linear RGB, OKLab, OKLCH or HSL, so you can compare how each space mixes. |
| **Contrast** | Checks a text color against a background with the WCAG 2 ratio and APCA Lc. |
| **Token** | A semantic name such as `bg/surface`, with one input per theme. Tokens can point at other tokens, forming alias chains. |
| **Note** | A sticky note for explaining what's going on. |

## Channel rules

A color with a parent decides, channel by channel, how it relates to that parent:

| Rule | Value |
|---|---|
| **Inherit** | The parent's value. |
| **Offset** | Parent + Δ. Hue wraps around; other channels are clamped to their range. |
| **Fixed** | The node's own value, independent of the parent. |
| **Formula** | An expression, for example `parent.l > 60 ? 15 : 98`. |

The inspector shows how each channel was computed, step by step.

## Formulas

A formula returns a number for one channel.

```text
parent.l > 60 ? 15 : 98              dark text on light parents, light text on dark ones
clamp(parent.c * 0.5, 0, 0.1)        half the parent's chroma, capped
@background.l + (dark ? 20 : -20)    follow another node and react to the theme
contrast(parent, white) >= 4.5 ? 100 : 0
```

**Variables**

| Name | Meaning |
|---|---|
| `parent` | The color connected to this node's input. |
| `self` | This node's own stored values (what the sliders hold). |
| `@name` | Any other node, by name, e.g. `@brand` or `@neutral`. |
| `dark` | `true` while a dark theme is active (`light` is the opposite). |
| `white`, `black` | Handy reference colors. |
| `#3b82f6` | Any hex color literal. |

**Channels.** Shorthand channels follow the node's own color space. In an OKLCH node, `parent.l`, `parent.c` and `parent.h` are OKLCH lightness, chroma and hue. To read another space, name it: `parent.hct.t`, `parent.hsl.s`, `parent.oklch.c`, `parent.rgb.r`. `alpha` (0–100) works on any color.

**Operators.** `+ - * / %`, comparisons `< <= > >= == !=`, logic `&& || !` (or `and`, `or`, `not`), and `condition ? a : b`.

**Functions**

| Function | Description |
|---|---|
| `clamp(x, min, max)` | Keep x between min and max. |
| `min(a, b, …)` | Smallest value. |
| `max(a, b, …)` | Largest value. |
| `lerp(a, b, t)` | Blend from a to b; t = 0..1. |
| `map(x, inMin, inMax, outMin, outMax)` | Re-map x from one range to another. |
| `round(x, step?)` | Round to the nearest step (default 1). |
| `floor(x)` | Round down. |
| `ceil(x)` | Round up. |
| `abs(x)` | Absolute value. |
| `pow(x, y)` | x to the power of y. |
| `sqrt(x)` | Square root. |
| `mod(x, y)` | Remainder that stays positive (handy for hue). |
| `step(edge, x)` | 0 below the edge, 1 at or above it. |
| `smoothstep(e0, e1, x)` | Smooth 0→1 transition between two edges. |
| `sin(degrees)` | Sine of an angle in degrees. |
| `cos(degrees)` | Cosine of an angle in degrees. |
| `if(condition, then, else)` | Same as `condition ? then : else`. |
| `contrast(a, b)` | WCAG 2 contrast ratio between two colors (1–21). |
| `apca(text, background)` | APCA lightness contrast Lc (about −108 to 106). |
| `luminance(color)` | WCAG relative luminance (0–1). |
| `deltaE(a, b)` | Perceptual difference (ΔE OK ×100; ~2 is barely visible). |
| `mix(a, b, t)` | Blend two colors in OKLab; returns a color. |

Function names are case-insensitive.

## Saving, sharing and exporting

- **Saving.** Everything is saved automatically in your browser (IndexedDB). Clearing site data deletes it, so export a JSON copy of anything you want to keep. JSON files can be imported back.
- **Share links.** A share link carries the whole project, compressed into the URL hash (the part after `#`). Browsers never send the hash to a server, so the project only travels inside the link.
- **Export.** CSS variables, Tailwind v4 `@theme`, DTCG JSON and plain JSON.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Add color / palette / mix / contrast / token / note | C / P / M / K / T / N |
| Select tool / pan tool | V / H (or hold Space) |
| Nudge selection | Arrow keys (⇧ for bigger steps) |
| Delete selection | Delete / Backspace |
| Duplicate | ⌘/Ctrl + D |
| Undo | ⌘/Ctrl + Z |
| Redo | ⇧⌘Z / Ctrl + Y |
| Copy / paste | ⌘/Ctrl + C / V |
| Select all | ⌘/Ctrl + A |
| Fit view | F |
| Add a color | Double-click the canvas |
| Add a connected node | Drag from an output handle into empty space |
| Create the source of an input | Drag from an input handle into empty space |
| Scrub a channel right on the canvas | Drag a value on a color node (⇧ faster, ⌥ finer) |
| Rename a node | Double-click its title |
| All shortcuts | ? |

## Local development

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

The dev server runs on <http://localhost:3000>.

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run the unit tests (Vitest) |
| `npm run check` | Typecheck, tests and build in one go |

## Hosting

0colors is a hosted app, not a self-hosting template. The maintainers run the official deployment on Railway, built from the `main` branch: `railway.json` builds the `Dockerfile`, which serves the static build with [Caddy](https://caddyserver.com) (healthcheck `/healthz`). There is no one-click deploy, and self-hosted installs aren't supported.

The code is MIT-licensed: you're welcome to read it, learn from it and reuse parts of it.

## Contributing

Issues and pull requests are welcome. Run `npm run check` before opening a PR; it type-checks, runs the tests and builds. Keep `src/engine` free of React and covered by tests.

## Project structure

```text
src/
  engine/   Pure TypeScript color logic (no React): conversions, gamut mapping,
            contrast, mixing, formulas, graph evaluation, palettes, exporters.
            Unit tests live next to the sources.
  app/      React UI: canvas, inspector, panels and the store.
  styles/   Tailwind entry point and the app's semantic CSS variables.
public/     Static files copied as-is into the build.
```

## Tech stack

React 19, TypeScript, Vite 8, Tailwind CSS 4, React Flow, Zustand, Radix UI and Material Color Utilities.

## License

[MIT](LICENSE)
