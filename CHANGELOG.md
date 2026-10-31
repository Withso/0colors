# Changelog

All notable changes to 0colors are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Deployment is now a static site: a Caddy container on Railway serves the built app, with a `/healthz` healthcheck.
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

## [1.1.0] — 2026-05-12

Self-hosted Railway template with Postgres, auth and admin settings (superseded by 2.0.0). Added the admin settings panel, public signup, session management and auth rate limiting.

## [1.0.0] — 2026-05-12

First open-source release: a self-hosted Railway template with Postgres, local auth and optional AI features (superseded by 2.0.0).

[Unreleased]: https://github.com/Withso/0colors/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Withso/0colors/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/Withso/0colors/releases/tag/v1.1.0
[1.0.0]: https://github.com/Withso/0colors/releases/tag/v1.0.0
