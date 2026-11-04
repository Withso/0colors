# 0colors

An open canvas for understanding color logic.

0colors lets you build a color system as a graph of nodes and see exactly how every color is computed: color spaces, inheritance, palettes, mixing, contrast, semantic tokens and light/dark themes. Change something and watch the rest of the graph follow.

It opens on the **demo** canvas: a guided tour in numbered sections (color spaces, rules, palettes, mixing, contrast, tokens and themes, logic, a glossary and canvas basics) built from live, editable nodes. The demo is always there — edit anything, and **Reset demo** (top bar, canvas menu or ⌘K) brings it back to its original state. It can't be deleted; "Make my own copy" turns it into a regular canvas.

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
| **Section** | A titled frame that groups nodes. Drag it by its title and everything inside moves along. |

The demo also uses **HTML frames**: built-in, static tutorial pages (`public/tutorials/*.html`, no scripts) rendered on the canvas with native buttons. They are part of the demo, not something you add to your own canvases.

## Channel rules

A color with a parent decides, channel by channel, how it relates to that parent:

| Rule | Value |
|---|---|
| **Inherit** | The parent's value. |
| **Offset** | Parent + Δ. Hue wraps around; other channels are clamped to their range. |
| **Fixed** | The node's own value, independent of the parent. |
| **Formula** | An expression, for example `if parent.l > 60 then 15 else 98`. |

Each channel has one small rule control in the inspector. Dragging a linked channel's slider turns it into an offset automatically.

## Formulas

A formula returns a number for one channel.

```text
if parent.l > 60 then 15 else 98     dark text on light parents, light text on dark ones
clamp(parent.c * 0.5, 0, 0.1)        half the parent's chroma, capped
@background.l + (dark ? 20 : -20)    follow another node and react to the theme
contrast(parent, white) >= 4.5 ? 100 : 0
mix(parent, white, 0.5)              a color: the channel takes that color's value for itself
```

**Rows.** Longer logic is written in rows. Each row can name its result with `=`, later rows can use that name, and the last row is the output. `//` starts a comment:

```text
// Pick readable text for whatever background this sits on
bg = @surface
ratio = contrast(bg, white)
if ratio >= 4.5 then 98 else 14
```

**Editing.** Every piece of a formula is a tag: colors with their swatch and channel, earlier rows with their live value, functions, numbers, operators and keywords. Type for suggestions (`@nodes`, channels after a dot, functions, earlier rows and keywords, with ready-made starters for an empty formula). Picking a function inserts its parentheses and one blank per argument, such as `mix( a , b , t )`, with the first blank selected and suggestions that fit it; Tab (or Enter) moves to the next blank, and typing `,` or `)` works too. Click any tag for choices that fit that spot: numbers with their range, colors with swatches, other channels or operators. Click a row's name to rename it (its uses follow) or delete the row.

Each row shows its value on the right and the last row shows the channel's output. Enter or **+ Add row** adds a row that starts from the previous row's result, so the output doesn't change until you edit it. Blanks still to fill in are shown calmly ("Fill in t — a number from 0 to 1"); until then the channel keeps its previous value. Esc or ⌘Enter finishes, Ctrl+Space shows suggestions, and hovering a tag shows its live value.

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

**Operators.** `+ - * / %`, comparisons `< <= > >= == !=`, logic `&& || !` (or `and`, `or`, `not`), `condition ? a : b` and `if condition then a else b`. Math symbols work too: `×` `÷` `−` `≤` `≥` `≠`.

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
| `tan(degrees)` | Tangent of an angle in degrees. |
| `atan2(y, x)` | Direction of (x, y) in degrees, 0–360. |
| `sign(x)` | −1, 0 or 1. |
| `log(x)`, `log2(x)`, `log10(x)` | Logarithms; x must be positive. |
| `exp(x)` | e raised to x. |
| `fract(x)` | Fractional part, 0–1. |
| `invlerp(a, b, v)` | Where v sits between a and b (0–1). |
| `huelerp(a, b, t)` | Blend hue angles along the shortest arc. |
| `if(condition, then, else)` | Same as `condition ? then : else`. |
| `contrast(a, b)` | WCAG 2 contrast ratio between two colors (1–21). |
| `apca(text, background)` | APCA lightness contrast Lc (about −108 to 106). |
| `luminance(color)` | WCAG relative luminance (0–1). |
| `deltaE(a, b)` | Perceptual difference (ΔE OK ×100; ~2 is barely visible). |
| `mix(a, b, t)` | Blend two colors in OKLab; returns a color. |

Function names are case-insensitive.

## Working on the canvas

- **Connect** by dragging from a node's right-side dot. You don't have to hit the target dot: drop on a node and it connects to the nearest compatible input (free inputs first). While you drag, the inputs that can take the connection light up.
- **Move or remove a connection** by dragging out of the input it feeds: drop it on another node to move it, on empty canvas to disconnect. Hovering a connection shows a × to disconnect; right-click it to insert a color in between.
- **Insert a node into a connection** by dropping an unconnected Color, Palette, Mix or Token on it — the connection lights up while you hover, and the node is spliced in between.
- **Cut connections** by holding X and dragging across them, or by right-dragging on the canvas (a plain right-click still opens the menu). Crossed connections turn red; Escape cancels.
- **Pick a color in 2D** in the color inspector: a plane of chroma × lightness (OKLCH), chroma × tone (HCT) or saturation × lightness (HSL) at the current hue, with the sRGB edge drawn. Dragging sets both channels in one step.
- **Create** by dragging a dot into empty space (a connected node or the source of an input), double-clicking the canvas, dragging a tool from the toolbar, pressing `/` for quick-add at the pointer, or pasting: ⌘V turns hex codes, CSS colors and CSS/JSON token lists into color nodes.
- **Arrange** with alignment guides while dragging (hold ⌘/Ctrl to turn them off), ⌥-drag to duplicate, align and distribute buttons for multiple nodes, and sections (⌥⌘G wraps the selection).
- **Find anything** with ⌘K: nodes and sections by name, every command, themes and files.

## Saving, sharing and exporting

- **Saving.** Everything is saved automatically in your browser (IndexedDB). Clearing site data deletes it, so export a JSON copy of anything you want to keep. JSON files can be imported back.
- **Share links.** A share link carries the whole project, compressed into the URL hash (the part after `#`). Browsers never send the hash to a server, so the project only travels inside the link.
- **Export.** CSS variables, Tailwind v4 `@theme`, DTCG JSON and plain JSON.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Search nodes and commands | ⌘/Ctrl + K |
| Quick-add at the pointer | / |
| Add color / palette / mix / contrast / token / note / section | C / P / M / K / T / N / S |
| Select tool / pan tool | V / H (or hold Space) |
| Nudge selection | Arrow keys (⇧ for bigger steps) |
| Delete selection | Delete / Backspace |
| Duplicate | ⌘/Ctrl + D |
| Undo | ⌘/Ctrl + Z |
| Redo | ⇧⌘Z / Ctrl + Y |
| Copy / paste (also between tabs; paste hex codes to add colors) | ⌘/Ctrl + C / V |
| Select all | ⌘/Ctrl + A |
| Fit view / zoom to selection / zoom to 100% | F / ⇧2 / ⇧0 |
| Wrap the selection in a section | ⌥⌘G / Ctrl + Alt + G |
| Duplicate while dragging | ⌥/Alt + drag |
| Cut connections | Hold X and drag across them, or right-drag |
| Insert a node into a connection | Drop an unconnected node on it |
| Rename the selected node | Enter |
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
