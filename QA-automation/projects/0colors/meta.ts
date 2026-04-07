/**
 * 0colors-specific selectors and timeouts for shared helpers.
 * Other products add their own meta.ts beside tests/.
 */
export const colorsMeta = {
  appShellSelector: '.app-shell',
  loadingSelector: '.app-shell-loading',
  commandPaletteBackdrop: '.cmd-palette-backdrop',
  commandPaletteInput: '.cmd-palette-search-input',
} as const;
