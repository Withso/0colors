---
name: 0colors-ui-system
description: Use when editing any frontend UI, page, component, theme, token, or style in 0colors. Enforces the 0colors semantic token system: backgrounds use surface tokens, foregrounds use on-surface/text/icon tokens, borders use border-on-surface tokens, and raw primitive palette tokens must not be used outside variables.css.
---

# 0colors UI System

Use this skill for any frontend styling or UI refactor in 0colors.

## Core rule

- Backgrounds: `surface-*`
- Foregrounds: `on-surface-*`, `text-*`, `icon-*`
- Borders: `border-on-surface-*`, `border-subtle`, `border-faint`

Do not use raw primitive palette tokens such as `--grey-*`, `--blue-*`, `--green-*`, etc. outside [packages/frontend/src/styles/variables.css](packages/frontend/src/styles/variables.css).

## Default workflow

1. Open [packages/frontend/src/styles/variables.css](packages/frontend/src/styles/variables.css) before styling changes.
2. Choose the container hierarchy with `surface-*` first.
3. Choose readable foregrounds with `text-*` / `icon-*` or `on-surface-*`.
4. Apply borders with `border-on-surface-*`.
5. Only then add `accent-*` or status tokens if the UI has interactive or semantic meaning.
6. If refactoring old code, replace primitive tokens with semantic tokens instead of introducing one-off aliases.

## Surface hierarchy

- `--surface-0`: page/app background
- `--surface-1`: shell, sidebar, main frame
- `--surface-2`: card, panel, section
- `--surface-3`: nested controls, hover, active chrome
- `--surface-4`: strongest local elevation before overlay
- `--surface-overlay`: scrim/backdrop

## Foreground hierarchy

- `--text-primary` / `--on-surface-0`: strongest readable text
- `--text-secondary` / `--icon-secondary`: secondary metadata
- `--text-tertiary` / `--icon-tertiary`: quiet support content
- `--text-disabled` / `--icon-disabled`: disabled or heavily de-emphasized content

## Borders

- `--border-on-surface-0`: strong border/divider
- `--border-on-surface-1`: default border
- `--border-on-surface-2`: soft border
- `--border-focus`: focus ring / active input emphasis

## Accent and status

- Use `--accent-primary`, `--accent-primary-hover`, `--accent-primary-strong` for CTA, selected, focus, and active interaction states.
- Use status tokens only when meaning is explicit:
  - success
  - warning
  - critical
  - info

## Dynamic-color exception

Inline styles are acceptable for runtime-generated values only:

- color previews
- gradients
- canvas-generated user colors
- alpha checkerboards and contrast logic

The surrounding UI chrome must still use semantic tokens.

## Audit pass after refactors

Run this scan after UI token edits:

```bash
rg -n "var\\(--(grey|blue|green|red|yellow|orange|purple|fuchsia|teal|sky|cyan|pink|lime)-|var\\(--default-(text|bg|link)-color" packages/frontend/src --glob '*.{tsx,ts,css}' -g '!packages/frontend/src/dist/**' -g '!packages/frontend/src/styles/variables.css'
```

The expected result is no matches.

## Reference

For examples and decision rules, read [references/semantic-token-usage.md](references/semantic-token-usage.md).
