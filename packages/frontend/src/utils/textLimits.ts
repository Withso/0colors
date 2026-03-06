// ─── Dynamic Text Max-Length Constants ──────────────────────────
// These constants define the maximum character lengths for all
// user-editable / user-nameable text fields across the application.
// When displaying text that may exceed these limits, always apply
// CSS truncation (e.g. `truncate` class + `title` attr for full text).
// When rendering input fields for these values, always set `maxLength`.

/** Token names (e.g. "grey-50", "primary-background") */
export const MAX_TOKEN_NAME = 40;

/** Group names in the tokens panel */
export const MAX_GROUP_NAME = 40;

/** Project names */
export const MAX_PROJECT_NAME = 40;

/** Page names */
export const MAX_PAGE_NAME = 32;

/** Theme names */
export const MAX_THEME_NAME = 32;

/** Node reference names (floating label on canvas) */
export const MAX_NODE_NAME = 40;

/** Palette names (palette node card + tokens panel) */
export const MAX_PALETTE_NAME = 40;

/** Auto-assign prefix */
export const MAX_AUTO_ASSIGN_PREFIX = 40;
