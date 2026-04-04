# 0colors Semantic Token Usage

## Decision order

When styling a UI area, decide in this order:

1. What surface level is this?
2. What text/icon emphasis does it need?
3. What border strength does it need?
4. Does it need interactive accent?
5. Does it need semantic status?

## Common mappings

### Pages and layout

- App background: `--surface-0`
- Sidebar / shell / fixed frame: `--surface-1`
- Content card / modal body / panel: `--surface-2`
- Embedded field / toolbar chip / hovered row: `--surface-3`

### Text and icons

- Main heading: `--text-primary`
- Body text: `--text-primary`
- Supporting text: `--text-secondary`
- Placeholder/help text: `--text-tertiary` or `--text-disabled`
- Default icon next to body text: `--icon-primary`
- Secondary icon next to secondary text: `--icon-secondary`

Keep text and icon emphasis aligned.

### Borders and separators

- Input border: `--border-on-surface-1`
- Card edge on page: `--border-on-surface-1`
- Table row separators: `--border-on-surface-2`
- Strong section divider: `--border-on-surface-0`
- Focused element: `--border-focus`

### Interactive states

- Primary button / selected tab / active nav: `--accent-primary`
- Hovered interactive accent state: `--accent-primary-hover`
- Pressed/stronger accent state: `--accent-primary-strong`

### Status

- Success badge text/icon: `--text-success` / `--icon-success`
- Success subtle background: `--surface-success-subtle`
- Warning subtle background: `--surface-warning-subtle`
- Critical subtle background: `--surface-critical-subtle`

Do not use success/warning/critical colors as generic decoration.

## Refactor guidance

If old code uses primitive tokens:

- background grey -> move to a `surface-*` token
- foreground grey -> move to `text-*`, `icon-*`, or `on-surface-*`
- border grey -> move to `border-on-surface-*`
- blue interactive state -> move to `accent-*`
- green/red/yellow meaning -> move to status tokens

## Smell checks

The UI probably needs correction if:

- two adjacent containers use the same surface level but should feel layered
- text is secondary while the icon beside it is still primary
- a neutral border uses an accent token
- a warning or success color appears without semantic meaning
- component code uses raw primitive tokens instead of semantic ones
