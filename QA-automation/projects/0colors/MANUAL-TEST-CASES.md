# 0colors — manual test catalog (legacy shorthand)

**Canonical catalog:** [`../../TEST-CATALOG.md`](../../TEST-CATALOG.md) — module IDs, layers (E2E / unit / manual), and backlog.

Traceability: run these for full regression; automated smoke lives in `packages/frontend/tests/e2e/*.spec.ts`.

## Suite A — Nodes

- **A1** Primary theme: create root HSL → child → palette; verify hierarchy and shades.
- **A2** Change root color; verify child inheritance (diff on/off, lock, unlink variants).
- **A3** Change palette shade count; verify regeneration.
- **A4** Cmd/Ctrl+D duplicate; verify copy. **A4-N** Non-primary theme: expect block + alert.
- **A5** Delete node with descendants; verify removal.
- **A6** Undo / Redo restore delete.
- **A7** Sample template: undo/redo shows toast, no state change.
- **A8** Duplicate with tokens: token restore prompt paths.

## Suite B — Tokens

- **B1** Create token.
- **B2** Assign to node; value updates propagate.
- **B3** Rename token; references consistent.
- **B4** Unassign → delete token.
- **B5** Undo restores token.

## Suite C — Themes & pages

- **C1** New theme; tokens initialized.
- **C2** Switch themes; colors per theme.
- **C3** Unlink from primary; edit; primary unchanged on return.
- **C4** New page; switch pages; canvas isolation.
- **C5** Delete theme/page; cleanup.

## Suite D — Projects

- **D1** Create project.
- **D2** Nodes + tokens persist.
- **D3** Duplicate project; full copy.
- **D4** Switch projects; data isolation.
- **D5** Delete duplicate only.

## Suite E — Import / export

- **E1** Export JSON download; structure valid.
- **E2** New project; import restores data.
- **E3** Figma format copy; valid JSON on clipboard.
- **E4** Bad JSON import; error + stable app.
- **E5** Sample mode import blocked.

## Suite F — Auth & cloud

- **F1** Sign in; sync UI.
- **F2** Cloud project edits; syncing state.
- **F3** Force refresh; no data loss.
- **F4** Sign out; local projects remain.

## Suite G — AI & Dev Mode

- **G1** AI chat send; dock/undock.
- **G2** Close/reopen; conversation persisted.
- **G3** Dev Mode setting persists after reload (cloud project).

## Suite H — Samples & misc

- **H1** Home without auth; sample loads.
- **H2** Switch samples.
- **H3** Duplicate sample to project.
- **H4** Cmd/Ctrl+K commands.
- **H5** Token table → navigate to node.
- **H6** Shortcuts panel.
