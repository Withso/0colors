// ============================================
// UTIL: logger
// PURPOSE: Dev-only debug logger — disappears in production builds
//
// Use `logger.debug(...)` wherever you'd have reached for `console.log`.
// It no-ops when `import.meta.env.DEV` is false (i.e. `vite build` output),
// so verbose breadcrumbs don't leak to production users' consoles. We keep
// `console.error` / `console.warn` for anything that should still appear
// in production — those are what error-tracking tools listen for.
// ============================================

const isDev = import.meta.env.DEV;

export const logger = {
  debug(...args: unknown[]): void {
    if (isDev) console.log(...args);
  },
  info(...args: unknown[]): void {
    if (isDev) console.info(...args);
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
