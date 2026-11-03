# Changelog

All notable changes to 0colors are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The demo canvas.** The sample is now a protected demo and the app's landing page: a guided tour in sections, from color spaces to logic, plus a glossary and canvas basics, with built-in HTML tutorial frames. It's always available, can be edited freely and restored with **Reset demo**; it can't be deleted.
- **Sections**: titled frames that group nodes and carry their contents when dragged, with resize handles and ⌥⌘G to wrap a selection.
- **Formula language v2**: `if … then … else`, multi-line formulas with named steps (`base = @brand`), `//` comments, math symbols (`× ÷ − ≤ ≥ ≠`), friendlier errors with suggestions, and new functions (`tan`, `atan2`, `sign`, `log`, `log2`, `log10`, `exp`, `fract`, `invlerp`, `huelerp`).
- **A new formula editor**: typeset display with node chips and the live result; syntax highlighting, context-aware autocomplete, signature help, precise error underlines and a step-by-step "How it's computed".
- **Forgiving connections**: drop a connection anywhere on a node, see which inputs can take it while dragging, pick a connection up from its input to move or remove it, disconnect from a hover ×, insert a color into a connection, and larger hit areas on every connector.
- **Faster composition**: ⌘K command palette, `/` quick-add at the pointer, drag tools from the toolbar onto the canvas, ⌥-drag to duplicate, paste hex codes / CSS colors / token lists as color nodes, copy and paste between tabs, alignment guides, align and distribute, zoom to selection (⇧2), Enter to rename.
- Hex, opacity and an eyedropper right in the color inspector.
- **A 2D color picker**: drag across OKLCH chroma × lightness (HCT chroma × tone, HSL saturation × lightness) at the current hue, with the sRGB edge drawn — both channels change in one step.
- **Drop a node onto a connection** to splice it in between, and **cut connections** by holding X and dragging across them (or right-dragging); both are single undo steps.

### Changed

- The right panel is minimal: no tutorials or glossary, one small rule control per channel instead of a four-way switch, compact headers and Figma-style tabs. Teaching moved onto the demo canvas.
- Color nodes have even padding at the bottom.
- Slow drags, scrubs and resizes are one undo step however long they pause.

## [2.0.0] — 2026-11-01

A complete rebuild. 0colors is now a local-only playground for understanding color logic. Everything runs in the browser, with no server, accounts or database.

### Added

- Node canvas: pan, zoom and connect nodes by dragging between them.
- Six node types: Color, Palette, Mix, Contrast, Token and Note.
- Per-channel rules for derived colors (Inherit, Offset, Fixed and Formula), with a step-by-step explanation of how each channel was computed.
- A formula language with math helpers, theme awareness (`dark`), references to other nodes (`@name`) and color functions such as `contrast()`, `apca()` and `mix()`.
- OKLCH, HCT, HSL and RGB color spaces, with CSS Color 4 gamut mapping for colors outside sRGB.
- Palettes with lightness curves, hue shift and chroma modes; every shade is its own output.
- Mixing in five spaces (sRGB, linear RGB, OKLab, OKLCH and HSL) to compare how each one blends.
- WCAG 2 and APCA contrast checks.
- Semantic tokens with one input per theme, and alias chains (tokens pointing at tokens).
- A live UI preview driven by your tokens.
- Export to CSS variables, Tailwind v4 `@theme`, DTCG JSON and plain JSON.
- Automatic saving to IndexedDB, plus JSON import and export.
- Share links that carry the whole project in the URL hash.
- A sample showcase canvas that uses every node type, with notes explaining each idea.
- Logic you can see: connections carry gradient strokes in the colors they pass along, edge labels summarize each rule (`L −6 · H +180`), formula references appear as dashed links, and hovering a node traces its whole lineage.
- Direct manipulation: drag a channel value on a color node to scrub it, double-click a title to rename, drag from an output into empty space to create a connected node, or from an input to create its source.
- A Share dialog, multiple local canvases with a searchable list, light and dark app appearance, canvas backdrops (dark, mid gray, light) and a keyboard-first workflow (`?` lists every shortcut).
- A calm, neutral interface in the spirit of Figma and macOS: true-gray chrome so colors are judged fairly, glass floating toolbars, compact inspector controls and subtle motion that respects reduced-motion settings.

### Changed

- 0colors is now a hosted app rather than a self-hosting template. The maintainers deploy it on Railway as a static site (a Caddy container with a `/healthz` healthcheck).
- The repository is a single package at the root (no npm workspaces).

### Removed

- The Hono backend API and the Postgres database.
- Authentication, admin settings and invites.
- Community publishing.
- AI chat and AI build mode.
- Cloud sync and session locks.
- Dev-mode webhooks and GitHub push.
- Figma variables export.
- Multi-page projects and spacing nodes.
- The QA automation suite and the marketing site.
- Self-hosting: the Railway template, the Deploy on Railway button and the self-hosting docs. Projects stored in a 1.x self-hosted Postgres database are not migrated.

## [1.1.0] — 2026-05-12

Self-hosted Railway template with Postgres, auth and admin settings (superseded by 2.0.0). Added the admin settings panel, public signup, session management and auth rate limiting.

## [1.0.0] — 2026-05-12

First open-source release: a self-hosted Railway template with Postgres, local auth and optional AI features (superseded by 2.0.0).

[Unreleased]: https://github.com/Withso/0colors/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Withso/0colors/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/Withso/0colors/releases/tag/v1.1.0
[1.0.0]: https://github.com/Withso/0colors/releases/tag/v1.0.0
