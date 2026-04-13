/**
 * Debug logging utility — only logs in development mode.
 * Replaces raw console.log statements to keep production builds clean.
 */

const isDev = import.meta.env.DEV;

export const debug = {
  log: isDev ? console.log.bind(console) : () => {},
  warn: isDev ? console.warn.bind(console) : () => {},
  error: console.error.bind(console), // Always log errors
};
